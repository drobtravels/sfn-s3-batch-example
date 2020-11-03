import * as cdk from '@aws-cdk/core'
import * as s3 from '@aws-cdk/aws-s3'
import * as lambda from '@aws-cdk/aws-lambda-nodejs'

export class BigFanOutStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const inventoryBucket = new s3.Bucket(this, 'InventoryBucket');

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

    const generateS3ListLambda = new lambda.NodejsFunction(this, 'generate-s3-list', {
      entry: 'lib/lambdas/generate-s3-list.js'
    }).addEnvironment('BUCKET_NAME', dataBucket.bucketName)
    
    dataBucket.grantPut(generateS3ListLambda)

    const startS3BatchJobLambda = null

    const processFileLambda = null

    const handleS3BatchCompletion = null

    const workflowStepFunction = null

  }
}
