#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { BigFanOutStack } from '../lib/big-fan-out-stack';

const app = new cdk.App();
new BigFanOutStack(app, 'BigFanOutStack');
