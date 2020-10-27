import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as BigFanOut from '../lib/big-fan-out-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new BigFanOut.BigFanOutStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
