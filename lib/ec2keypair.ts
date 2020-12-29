import { Construct, CustomResource, CustomResourceProvider, CustomResourceProviderRuntime } from "@aws-cdk/core";

export interface EC2KeyPairProps {
  readonly keyNameBase: string;
}

/**
 * Create a new keypair and store the private part in SSMPS
 */
export class EC2KeyPair extends Construct {
  public readonly keyName: string;
  public readonly parameterName: string;

  constructor(scope: Construct, id: string, props: EC2KeyPairProps) {
    super(scope, id);

    const serviceToken = CustomResourceProvider.getOrCreate(this, 'KeyPairProvider', {
      codeDirectory: `${__dirname}/custom-resource`,
      runtime: CustomResourceProviderRuntime.NODEJS_12,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['ec2:CreateKeyPair', 'ec2:DeleteKeyPair', 'ssm:PutParameter', 'ssm:DeleteParameter'],
          Resource: ['*'],
        }
      ],
    });
    const instanceKey = new CustomResource(this, 'KeyPair', {
      resourceType: 'Custom::KeyPair',
      serviceToken: serviceToken,
      properties: {
        KeyNameBase: props.keyNameBase,
      },
    });

    this.keyName = instanceKey.getAttString('KeyName');
    this.parameterName = instanceKey.getAttString('Parameter');
  }
}