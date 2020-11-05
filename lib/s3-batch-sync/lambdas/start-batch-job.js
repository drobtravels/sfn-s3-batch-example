const S3Control = require('aws-sdk/clients/s3control')
const DDB = require('aws-sdk/clients/dynamodb')

const dynamoDB = new DDB.DocumentClient()
const s3Client = new S3Control()

const saveJobIdTaskToken = async function ({ TaskToken, JobId }) {
  const params = {
    Item: {
      JobId,
      TaskToken
    },
    TableName: process.env.JOB_TABLE_NAME
  }
  console.log('saving job id and task token to DynamoDB', params)
  return dynamoDB.put(params).promise()
}

exports.handler = async function (event) {
  console.log('event', event)
  const { manifestLocation, taskToken } = event

  const params = {
    AccountId: process.env.ACCOUNT_ID,
    ConfirmationRequired: false,
    Manifest: {
      Location: {
        ETag: manifestLocation.ETag,
        ObjectArn: `arn:aws:s3:::${manifestLocation.Bucket}/${manifestLocation.Key}`
      },
      Spec: {
        Format: 'S3BatchOperations_CSV_20180820',
        Fields: [
          'Bucket',
          'Key'
        ]
      }
    },
    Operation: {
      LambdaInvoke: {
        FunctionArn: process.env.JOB_LAMBDA_ARN
      }
    },
    Priority: '1', // Using 1 for general priority
    Report: {
      Bucket: process.env.REPORT_BUCKET,
      Enabled: true,
      Prefix: process.env.REPORT_PREFIX,
      ReportScope: 'AllTasks',
      Format: 'Report_CSV_20180820'
    },
    RoleArn: process.env.JOB_ROLE_ARN
  }

  console.log('submitting batch job with params', params)
  const response = await s3Client.createJob(params).promise()

  await saveJobIdTaskToken({ JobId: response.JobId, TaskToken: taskToken })
  console.log('submitted', response)
  return response
}
