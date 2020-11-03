import * as cdk from '@aws-cdk/core'
import * as s3 from '@aws-cdk/aws-s3'
import * as lambda from '@aws-cdk/aws-lambda-nodejs'
import * as sfn from '@aws-cdk/aws-stepfunctions'
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks'
import * as iam from '@aws-cdk/aws-iam'

export class BigFanOutStack extends cdk.Stack {

  public readonly stepFunction: sfn.StateMachine

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const inventoryBucket = new s3.Bucket(this, 'InventoryBucket');

    const s3BatchReportPrefix = 's3-batch-reports/'

    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      inventories: [
        {
          frequency: s3.InventoryFrequency.DAILY,
          includeObjectVersions: s3.InventoryObjectVersion.CURRENT,
          destination: {
            bucket: inventoryBucket,
          },
          format: s3.InventoryFormat.PARQUET
        }
      ]
    })

    const manifestBucket = dataBucket
    const manifestPrefix = 'manifests/'

    const generateS3ListLambda = new lambda.NodejsFunction(this, 'generate-s3-list', {
      entry: 'lib/lambdas/generate-s3-list.js'
    }).addEnvironment('BUCKET_NAME', dataBucket.bucketName)
    
    manifestBucket.grantPut(generateS3ListLambda, `${manifestPrefix}*`)

    const generateS3ListStep = new tasks.LambdaInvoke(this, 'Generate S3 List', {
      lambdaFunction: generateS3ListLambda,
      payloadResponseOnly: true,
      resultPath: '$.manifestLocation'
    })

    const processFileLambda = new lambda.NodejsFunction(this, 'process-file', {
      entry: 'lib/lambdas/process-file.js'
    })

    const s3BatchRole = new iam.Role(this, 'S3BatchRole', {
      assumedBy: new iam.ServicePrincipal('batchoperations.s3.amazonaws.com'),
      description: 'Allow S3 Batch jobs to invoke Lambda',
    })

    processFileLambda.grantInvoke(s3BatchRole)
    manifestBucket.grantRead(s3BatchRole, `${manifestPrefix}*`)
    inventoryBucket.grantReadWrite(s3BatchRole, `${s3BatchReportPrefix}*`)

    const startS3BatchJobLambda = new lambda.NodejsFunction(this, 'start-batch-job', {
      entry: 'lib/lambdas/start-batch-job.js',
      environment: {
        ACCOUNT_ID: this.account,
        JOB_LAMBDA_ARN: processFileLambda.functionArn,
        REPORT_BUCKET: inventoryBucket.bucketArn,
        REPORT_PREFIX: s3BatchReportPrefix,
        JOB_ROLE_ARN: s3BatchRole.roleArn
      }
    })

    startS3BatchJobLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['s3:CreateJob']
    }))
    startS3BatchJobLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: [s3BatchRole.roleArn],
      actions: ['iam:PassRole']
    }))
    

    const startS3BatchStep = new tasks.LambdaInvoke(this, 'Start S3 Batch Job', {
      lambdaFunction: startS3BatchJobLambda,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      timeout: cdk.Duration.minutes(5),
      payload: sfn.TaskInput.fromObject({
        manifestLocation: sfn.JsonPath.stringAt('$.manifestLocation'),
        taskToken: sfn.JsonPath.taskToken
      })
    })

    const handleS3BatchCompletion = null

    const stepWorkflow = generateS3ListStep
      .next(startS3BatchStep)
  
    this.stepFunction = new sfn.StateMachine(this, 'Workflow', {
      definition: stepWorkflow,
      tracingEnabled: true
    })

  }
}
