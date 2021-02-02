import * as cdk from '@aws-cdk/core';
import { KesselRun } from './kesselrun';

export class KesselRunStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new KesselRun(this, 'Default');
  }
}
