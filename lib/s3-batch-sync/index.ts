import * as cdk from '@aws-cdk/core'
import { IBucket } from '@aws-cdk/aws-s3'
import { Function, IFunction, Code, Runtime } from '@aws-cdk/aws-lambda'
import * as path from 'path'
import * as lambda from '@aws-cdk/aws-lambda-nodejs'
import * as iam from '@aws-cdk/aws-iam'
import * as sfn from '@aws-cdk/aws-stepfunctions'
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks'
import * as ddb from '@aws-cdk/aws-dynamodb'
import { Rule, RuleTargetInput } from '@aws-cdk/aws-events'
import * as eventTargets from '@aws-cdk/aws-events-targets'

export interface s3Location {
  bucket: IBucket,
  prefix: string
}

export interface S3BatchSyncProps {
  processLambda: IFunction, // The Lambda function which should be invoked to process an item by S3 Batch
  manifestLocation: s3Location, // the location (S3 Bucket and prefix) of the manifest file.  Object key is not required
  reportLocation: s3Location, // the location (S3 Bucket and prefix) for S3 Batach to write reports
  manifestLocationPath: sfn.JsonPath // The JSON path in the Step Function input where the Bucket and Key of manifest location will be
  accountId: string
}

export class S3BatchSync extends cdk.Construct {

  protected props: S3BatchSyncProps
  protected s3BatchRole: iam.IRole
  protected jobIdTaskTokenTable: ddb.Table

  public readonly stepFunctionTask: tasks.LambdaInvoke // The Task to start the Batch Job

  constructor(scope: cdk.Construct, id: string, props: S3BatchSyncProps) {
    super(scope, id)
    this.props = props

    this.s3BatchRole = this.generateS3BatchRole()

    this.jobIdTaskTokenTable = this.generateTable()

    const startS3BatchJobLambda = this.generateLambdaToStartS3BatchJob()

    this.handleJobCompletion()

    this.stepFunctionTask = new tasks.LambdaInvoke(this, 'Start S3 Batch Job', {
      lambdaFunction: startS3BatchJobLambda,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      timeout: cdk.Duration.days(1),
      payload: sfn.TaskInput.fromObject({
        manifestLocation: props.manifestLocationPath,
        taskToken: sfn.JsonPath.taskToken
      })
    })
  }

  generateTable(): ddb.Table {
    return new ddb.Table(this, 'JobIdTaskTokenTable', {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'JobId',
        type: ddb.AttributeType.STRING
      }
    })
  }

  generateS3BatchRole(): iam.Role {
    const role = new iam.Role(this, 'S3BatchRole', {
      assumedBy: new iam.ServicePrincipal('batchoperations.s3.amazonaws.com'),
      description: 'Allow S3 Batch jobs to invoke Lambda',
    })

    this.props.processLambda.grantInvoke(role)
    this.props.manifestLocation.bucket.grantRead(role, `${this.props.manifestLocation.prefix}/*`)
    this.props.reportLocation.bucket.grantReadWrite(role, `${this.props.reportLocation.prefix}/*`)
  
    return role
  }

  generateLambdaToStartS3BatchJob(): IFunction {
    const startLambda = new lambda.NodejsFunction(this, 'start-batch-job', {
      entry: 'lib/s3-batch-sync/lambdas/start-batch-job.js',
      environment: {
        ACCOUNT_ID: this.props.accountId,
        JOB_LAMBDA_ARN: this.props.processLambda.functionArn,
        REPORT_BUCKET: this.props.reportLocation.bucket.bucketArn,
        REPORT_PREFIX: this.props.reportLocation.prefix,
        JOB_ROLE_ARN: this.s3BatchRole.roleArn,
        JOB_TABLE_NAME: this.jobIdTaskTokenTable.tableName
      }
    })

    // Lambda funciton needs permission to create an S3 Batch Job
    startLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['s3:CreateJob']
    }))

    // Lambda function needs permission to pass the IAM role to S3 Batch service
    startLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: [this.s3BatchRole.roleArn],
      actions: ['iam:PassRole']
    }))

    // Lambda functions needs to save the job id / task token
    this.jobIdTaskTokenTable.grant(startLambda, 'dynamodb:PutItem')

    return startLambda
  }

  handleJobCompletion() {

    const completionLambda = new lambda.NodejsFunction(this, 'onS3JobCompletion', {
      entry: 'lib/s3-batch-sync/lambdas/on-job-completion.js',
      environment: {
        JOB_TABLE_NAME: this.jobIdTaskTokenTable.tableName
      }
    })

    // Lambda function needs permission to callback to Step Functions
    completionLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'states:SendTaskFailure',
        'states:SendTaskSuccess'
      ],  
      resources: ['*']
    }))

    this.jobIdTaskTokenTable.grantReadData(completionLambda)

    const s3JobChangedPattern = {
      source: ['aws.s3'],
      'detail-type': ['AWS Service Event via CloudTrail'],
      detail: {
        eventSource: ['s3.amazonaws.com'],
        eventName: ['JobStatusChanged'],
        serviceEventDetails: {
          status: [
            'Complete',
            'Failed'
          ]
        }
      }
    }

    const eventBridgeRule = new Rule(this, 'S3BatchJobChange', {
      description: 'Handle S3 Batch Job Completions and trigger Lambda function',
      enabled: true,
      eventPattern: s3JobChangedPattern,
      targets: [
        new eventTargets.LambdaFunction(completionLambda, {
          event: RuleTargetInput.fromEventPath('$.detail.serviceEventDetails')
        })
      ]
    })
  }
}