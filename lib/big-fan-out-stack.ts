import * as cdk from '@aws-cdk/core'
import * as s3 from '@aws-cdk/aws-s3'
import * as lambda from '@aws-cdk/aws-lambda-nodejs'
import * as sfn from '@aws-cdk/aws-stepfunctions'
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks'
import * as iam from '@aws-cdk/aws-iam'
import { S3BatchSync } from './s3-batch-sync'

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

    const s3BatchSync = new S3BatchSync(this, 'ProcessS3Files', {
      processLambda: processFileLambda,
      manifestLocation: {
        bucket: manifestBucket,
        prefix: manifestPrefix
      },
      reportLocation: {
        bucket: inventoryBucket,
        prefix: 'reports/'
      },
      manifestLocationPath: sfn.JsonPath.stringAt('$.manifestLocation'),
      accountId: this.account
    })

    const handleS3BatchCompletion = null

    const stepWorkflow = generateS3ListStep
      .next(s3BatchSync.stepFunctionTask)
  
    this.stepFunction = new sfn.StateMachine(this, 'Workflow', {
      definition: stepWorkflow,
      tracingEnabled: true
    })

  }
}
