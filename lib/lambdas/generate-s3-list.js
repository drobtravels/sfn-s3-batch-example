const S3 = require('aws-sdk/clients/s3')

const s3Client = new S3()

exports.handler = async function () {
  const file = `${process.env.BUCKET_NAME},user1/foo1.txt\n${process.env.BUCKET_NAME},user1/foo2.json\n${process.env.BUCKET_NAME},user1/foo3.json`

  const s3Location = {
    Bucket: process.env.BUCKET_NAME,
    Key: 'manifests/manifest.csv'
  }

  const params = Object.assign({ Body: file }, s3Location)

  const response = await s3Client.putObject(params).promise()

  console.log('s3 resposne', response)

  return Object.assign({ ETag: JSON.parse(response.ETag) }, s3Location)
}