#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { KesselRunStack } from '../lib/kesselrun-stack';

const app = new cdk.App();
new KesselRunStack(app, 'KesselRunStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
});
