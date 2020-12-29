import { Construct } from "@aws-cdk/core";
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as apigw from '@aws-cdk/aws-apigateway';

export interface S3GatewayProps {
  /**
   * Bucket to read from
   */
  readonly bucket: s3.IBucket;
}

/**
 * An API Gateway that reads static files from S3
 */
export class S3Gateway extends Construct {
  private readonly gateway: apigw.RestApi;

  constructor(scope: Construct, id: string, props: S3GatewayProps) {
    super(scope, id);

    const methodResponses = [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Content-Type': false,
          'method.response.header.Content-Disposition': false,
        }
      },
      { statusCode: '404' },
    ];

    const integrationResponses = [
      {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Content-Type': 'integration.response.header.Content-Type',
          'method.response.header.Content-Disposition': 'integration.response.header.Content-Disposition',
        },
      },
      { selectionPattern: '^404', statusCode: '404' },
    ];

    const role = new iam.Role(scope, 'S3IntegrationRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
    props.bucket.grantRead(role);

    this.gateway = new apigw.RestApi(this, 'GameApp', {
      defaultIntegration: new apigw.AwsIntegration({
        service: 's3',
        integrationHttpMethod: 'GET',
        path: `${props.bucket.bucketName}/index.html`,
        options: {
          credentialsRole: role,
          integrationResponses,
        },
      }),
      binaryMediaTypes: [
        // To stop API GW from touching binary files
        'image/*',
      ],
    });
    this.gateway.root.addMethod('GET', undefined, {
      methodResponses,
    });

    const s3proxy = this.gateway.root.addResource('{proxy+}', {
      defaultIntegration: new apigw.AwsIntegration({
        service: 's3',
        integrationHttpMethod: 'GET',
        path: `${props.bucket.bucketName}/{objkey}`,
        options: {
          credentialsRole: role,
          requestParameters: {
            'integration.request.path.objkey': 'method.request.path.proxy',
          },
          integrationResponses,
        },
      }),
      // 'defaultMethodOptions' responses don't work for the addMethod() call below.
    });
    s3proxy.addMethod('GET', undefined, {
      requestParameters: {
        'method.request.path.proxy': true
      },
      methodResponses,
    });
  }

  public addResource(path: string, options?: apigw.ResourceOptions) {
    return this.gateway.root.addResource(path, options);
  }
}
