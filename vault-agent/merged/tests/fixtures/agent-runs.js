module.exports = {
  completedRun: {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000002',
    model: 'claude-opus-4-6',
    provider: 'anthropic',
    user_message: 'What is the weather?',
    final_response: 'I searched and found...',
    status: 'completed',
    input_tokens: 150,
    output_tokens: 300,
  },
  failedRun: {
    id: 'aaaaaaaa-0000-0000-0000-000000000002',
    user_id: '00000000-0000-0000-0000-000000000002',
    model: 'gpt-4o',
    provider: 'openai',
    user_message: 'Do something impossible',
    status: 'failed',
    error: 'Rate limit exceeded',
  },
};
