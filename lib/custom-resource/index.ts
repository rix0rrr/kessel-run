import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse } from "aws-lambda";

import * as AWS from 'aws-sdk';

const ec2 = new AWS.EC2();
const ssm = new AWS.SSM();

export async function handler(event: CloudFormationCustomResourceEvent) {
  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    const rnd = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);

    const keyName = event.ResourceProperties.KeyNameBase + rnd;
    const parameterName = `/KeyMaterial/${keyName}`;

    const response = await ec2.createKeyPair({
      KeyName: keyName,
    }).promise();

    await ssm.putParameter({
      Name: parameterName,
      Value: response.KeyMaterial ?? '',
      Type: 'SecureString',
    }).promise();

    return {
      PhysicalResourceId: `${keyName}|${parameterName}`,
      Data: {
        KeyName: keyName,
        Parameter: parameterName,
      },
    };
  }

  if (event.RequestType === 'Delete') {
    const [keyName, parameterName] = event.PhysicalResourceId.split('|');
    await ec2.deleteKeyPair({
      KeyName: keyName,
    }).promise();

    await ssm.deleteParameter({
      Name: parameterName,
    }).promise();

    return {};
  }

  throw new Error(`Did not understand event: ${JSON.stringify(event)}`);
}
