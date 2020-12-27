#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { GameboxStack } from '../lib/gamebox-stack';

const app = new cdk.App();
new GameboxStack(app, 'GameboxStack');
