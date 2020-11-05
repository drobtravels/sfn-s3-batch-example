const S3Control = require('aws-sdk/clients/s3control')
// import { v4 as uuidv4 } from 'uuid'

const s3Client = new S3Control()

exports.handler = async function (event) {
  console.log('event', event)
  const { manifestLocation } = event

  const params = {
    AccountId: process.env.ACCOUNT_ID,
    // ClientRequestToken: uuidv4(),
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
  console.log('submitted', response)
}
