import { APIGatewayEvent } from "aws-lambda";
import * as AWS from 'aws-sdk';
import * as RSA from 'node-rsa';

const securityGroupId = process.env.SECURITY_GROUP_ID!;
const instanceId = process.env.INSTANCE_ID!;
const keyParameterName = process.env.KEY_PARAMETER_NAME!;

let password: string | undefined;

const ec2 = new AWS.EC2();
const ssm = new AWS.SSM();

export async function handler(request: APIGatewayEvent) {
  try {
    if (request.httpMethod === 'POST') {
      const { action, parameters } = JSON.parse(request.body ?? '{}');
      await ACTIONS[action](parameters);
    }

    const response = {
      ...await describe(),
      requestIp: request.requestContext.identity.sourceIp,
      event: request
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (e) {
    console.log(JSON.stringify(e));
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: e.message,
        stack: (e as Error).stack,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }
}

const ACTIONS: Record<string, (x:Record<string, any>) => Promise<void>> = {
  async updateToMe(parameters: Record<string, any>) {
    // Replace all current ranges
    const currentSG = await ec2.describeSecurityGroups({
      GroupIds: [securityGroupId],
    }).promise();

    const currentRanges = currentSG?.SecurityGroups?.[0].IpPermissions;

    console.log(JSON.stringify(currentRanges));

    // Replace everything in this group
    await ec2.revokeSecurityGroupIngress({
      GroupId: securityGroupId,
      IpPermissions: currentRanges?.map(r => ({
        FromPort: r.FromPort,
        ToPort: r.ToPort,
        IpProtocol: r.IpProtocol,
        IpRanges: noEmpty(r.IpRanges),
        Ipv6Ranges: noEmpty(r.Ipv6Ranges),
        PrefixListIds: noEmpty(r.PrefixListIds),
        UserIdGroupPairs: noEmpty(r.UserIdGroupPairs),
      })),
    }).promise();

    await ec2.authorizeSecurityGroupIngress({
      GroupId: securityGroupId,
      CidrIp: `${parameters.ipAddress}/32`,
      IpProtocol: '-1',
    }).promise();
  },
  async start() {
    await ec2.startInstances({
      InstanceIds: [instanceId],
    }).promise();
  },
  async stop() {
    await ec2.stopInstances({
      InstanceIds: [instanceId],
    }).promise();
  },

  async retrievePassword() {
    const [ec2Password, keyParameter] = await Promise.all([
      ec2.getPasswordData({ InstanceId: instanceId }).promise(),
      ssm.getParameter({ Name: keyParameterName, WithDecryption: true }).promise(),
    ]);

    const encrypted = ec2Password?.PasswordData ?? '';
    if (!encrypted) {
      password = 'N/A, try again in some minutes';
      return;
    }

    const rsa = new RSA(keyParameter.Parameter?.Value ?? '');
    rsa.setOptions({ encryptionScheme: 'pkcs1' });
    password = rsa.decrypt(Buffer.from(encrypted, 'base64'), 'utf8');
  },
};

async function describe() {
  const [instancesR, securityGroupStatusR] = await Promise.all([
    ec2.describeInstances({
      InstanceIds: [instanceId],
    }).promise(),

    ec2.describeSecurityGroups({
      GroupIds: [securityGroupId],
    }).promise(),
  ]);

  const instance = instancesR.Reservations?.[0].Instances?.[0];
  const securityGroupStatus = securityGroupStatusR.SecurityGroups?.[0];

  const clientIps = securityGroupStatus?.IpPermissions?.[0]?.IpRanges?.map(r => r.CidrIp).join(',');

  return {
    instanceState: instance?.State?.Name,
    publicDnsName: instance?.PublicDnsName,
    publicIpAddress: instance?.PublicIpAddress,
    clientIp: clientIps,

    // Global variable
    password,
  };
}

function noEmpty<A>(xs: A[] | undefined) {
  if (xs !== undefined && xs.length === 0) { return undefined; }
  return xs;
}