import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3depl from '@aws-cdk/aws-s3-deployment';
import { BlockDeviceVolume, Vpc } from '@aws-cdk/aws-ec2';
import { S3Gateway } from './s3gateway';

export class GameboxStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Be prepared to pay $0.10/GiB-month even as the instance is not running.
    const diskSize = cdk.Size.gibibytes(50);
    const yourIp = '1.2.3.4';

    const vpc = Vpc.fromLookup(this, 'Vpc', { isDefault: true });

    // Need IAM credentials to download nVidia GPU Drivers
    // Exists solely to prove that we are AWS customers.
    //
    // https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/install-nvidia-driver.html#nvidia-gaming-driver
    const nvidiaUser = new iam.User(this, 'NVidiaUser', {
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess')
      ],
    });
    const userKey = new iam.CfnAccessKey(this, 'AccessKey', {
      userName: nvidiaUser.userName,
    });

    const serviceToken = cdk.CustomResourceProvider.getOrCreate(this, 'Custom::MyCustomResourceType', {
      codeDirectory: `${__dirname}/custom-resource`,
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['ec2:CreateKeyPair', 'ec2:DeleteKeyPair', 'ssm:PutParameter'],
          Resource: ['*'],
        }
      ],
    });
    const instanceKey = new cdk.CustomResource(this, 'KeyPair', {
      resourceType: 'Custom::KeyPair',
      serviceToken: serviceToken,
      properties: {
        KeyNameBase: 'GameKey',
      },
    });
    const instanceKeyParameterName = instanceKey.getAttString('Parameter');

    const instance = new ec2.Instance(this, 'Instance', {
      instanceType: new ec2.InstanceType('g4dn.xlarge'),
      machineImage: new ec2.WindowsImage(ec2.WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE),
      vpc,
      keyName: instanceKey.getAttString('KeyName'),
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: BlockDeviceVolume.ebs(diskSize.toGibibytes(), {
            deleteOnTermination: true,
            volumeType: 'gp3' as any, // OOPS
          }),
        }
      ],
      userDataCausesReplacement: true,
    });
    // SSM
    instance.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    (instance.node.defaultChild as ec2.CfnInstance).ebsOptimized = true;

    // Keys in UserData is not great, but at least the permissions are very limited...
    instance.addUserData(
      `Set-AWSCredential -AccessKey ${userKey.ref} -SecretKey ${userKey.attrSecretAccessKey} -StoreAs GPUUpdateG4Dn`
    );

    // Need to edit IP address, should provide a Lambda for this
    instance.connections.allowFrom(ec2.Peer.ipv4(`${yourIp}/32`), ec2.Port.allTraffic(), 'CLIENT');

    const securityGroup = instance.connections.securityGroups[0]!;

    // ----------------------------------------------
    const bucket = new s3.Bucket(this, 'Bucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new s3depl.BucketDeployment(this, 'Deployment', {
      destinationBucket: bucket,
      sources: [
        s3depl.Source.asset(`${__dirname}/webapp-static`),
      ],
    });

    // WebApp
    const fn = new lambda.Function(this, 'WebAppLambda', {
      code: lambda.Code.fromAsset(`${__dirname}/webapp-lambda`),
      handler: 'handler.handler',
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(1),
      environment: {
        INSTANCE_ID: instance.instanceId,
        SECURITY_GROUP_ID: securityGroup.securityGroupId,
        KEY_PARAMETER_NAME: instanceKeyParameterName,
      },
    });

    // Look at instances, security groups
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:DescribeSecurityGroups', 'ec2:DescribeInstances'],
      resources: ['*'],
    }));

    // Mutate OUR security group
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:AuthorizeSecurityGroupIngress', 'ec2:RevokeSecurityGroupIngress'],
      resources: [
        this.formatArn({
          service: 'ec2',
          resource: 'security-group',
          resourceName: securityGroup.securityGroupId,
        })
      ],
    }));

    // Start/stop OUR instance
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:StartInstances', 'ec2:StopInstances', 'ec2:GetPasswordData'],
      resources: [
        this.formatArn({
          service: 'ec2',
          resource: 'instance',
          resourceName: instance.instanceId,
        })
      ],
    }));

    // Read secret key
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        this.formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: instanceKeyParameterName,
          sep: '', // Because the '/' is already in the name of the parameter
        })
      ],
    }));
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: ['*'],
    }));

    const gateway = new S3Gateway(this, 'S3Gateway', {
      bucket,
    });
    const lamna = gateway.addResource('api', {
      defaultIntegration: new apigw.LambdaIntegration(fn),
    });
    lamna.addMethod('ANY', undefined, {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '500' },
      ]
    });
  }
}
