import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadProviderConfig, runCrossReview, getCrossReviewProvider } from '../src/lib/cross-review.js';

describe('cross-review', () => {
  describe('loadProviderConfig', () => {
    it('loads openai provider config', () => {
      const config = loadProviderConfig(process.cwd(), 'openai');
      assert.ok(config, 'should load openai config');
      assert.ok(config.api, 'should have api section');
      assert.ok(config.provider, 'should have provider section');
    });

    it('loads ollama provider config', () => {
      const config = loadProviderConfig(process.cwd(), 'ollama');
      assert.ok(config, 'should load ollama config');
    });

    it('returns null for nonexistent provider', () => {
      const config = loadProviderConfig(process.cwd(), 'nonexistent-provider');
      assert.equal(config, null);
    });

    it('returns null for nonexistent directory', () => {
      const config = loadProviderConfig('/tmp/nonexistent', 'openai');
      assert.equal(config, null);
    });
  });

  describe('runCrossReview', () => {
    it('returns error when no provider config', async () => {
      const result = await runCrossReview('diff content', 'review this', null);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('No provider config'));
    });

    it('returns error when API key not in env', async () => {
      const config = { api_key_env: 'NONEXISTENT_API_KEY_12345', model: 'test' };
      const result = await runCrossReview('diff', 'prompt', config);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('API key not found'));
    });

    it('returns model name in result', async () => {
      const config = { api_key_env: 'NONEXISTENT_KEY', model: 'gpt-4o' };
      const result = await runCrossReview('diff', 'prompt', config);
      assert.equal(result.model, 'gpt-4o');
    });
  });

  describe('getCrossReviewProvider', () => {
    it('returns null when no review_provider in config', () => {
      // Current config.toml doesn't have review_provider
      const result = getCrossReviewProvider(process.cwd());
      assert.equal(result, null);
    });

    it('returns null for nonexistent directory', () => {
      const result = getCrossReviewProvider('/tmp/nonexistent');
      assert.equal(result, null);
    });
  });
});
