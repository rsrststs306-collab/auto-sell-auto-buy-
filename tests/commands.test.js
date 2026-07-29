const test = require('node:test');
const assert = require('node:assert/strict');

const sayPrefix = require('../src/prefixCommands/say');
const saySlash = require('../src/slashCommands/sayslashcommand');
const kickPrefix = require('../src/prefixCommands/kick');
const kickSlash = require('../src/slashCommands/kickslashcommand');
const banPrefix = require('../src/prefixCommands/ban');
const banSlash = require('../src/slashCommands/banslashcommand');
const clearPrefix = require('../src/prefixCommands/clear');
const clearSlash = require('../src/slashCommands/clearslashcommand');
const setEmbedImagePrefix = require('../src/prefixCommands/setembedimage');
const setEmbedImageSlash = require('../src/slashCommands/setembedimageslashcommand');
const { errorEmbed, buildPremiumDescription } = require('../src/helpers');

test('prefix say command exports expected metadata', () => {
  assert.equal(sayPrefix.name, 'say');
  assert.equal(typeof sayPrefix.execute, 'function');
});

test('slash say command exports expected metadata', () => {
  assert.equal(saySlash.data.name, 'say');
  assert.equal(typeof saySlash.execute, 'function');
});

test('prefix kick command exports expected metadata', () => {
  assert.equal(kickPrefix.name, 'kick');
  assert.equal(typeof kickPrefix.execute, 'function');
});

test('slash kick command exports expected metadata', () => {
  assert.equal(kickSlash.data.name, 'kick');
  assert.equal(typeof kickSlash.execute, 'function');
});

test('prefix ban command exports expected metadata', () => {
  assert.equal(banPrefix.name, 'ban');
  assert.equal(typeof banPrefix.execute, 'function');
});

test('slash ban command exports expected metadata', () => {
  assert.equal(banSlash.data.name, 'ban');
  assert.equal(typeof banSlash.execute, 'function');
});

test('prefix clear command exports expected metadata', () => {
  assert.equal(clearPrefix.name, 'clear');
  assert.equal(typeof clearPrefix.execute, 'function');
});

test('slash clear command exports expected metadata', () => {
  assert.equal(clearSlash.data.name, 'clear');
  assert.equal(typeof clearSlash.execute, 'function');
});

test('prefix setembedimage command exports expected metadata', () => {
  assert.equal(setEmbedImagePrefix.name, 'setembedimage');
  assert.equal(typeof setEmbedImagePrefix.execute, 'function');
});

test('slash setembedimage command exports expected metadata', () => {
  assert.equal(setEmbedImageSlash.data.name, 'setembedimage');
  assert.equal(typeof setEmbedImageSlash.execute, 'function');
});

test('prefix feedback command exports expected metadata', () => {
  const feedbackPrefix = require('../src/prefixCommands/feedback');
  assert.equal(feedbackPrefix.name, 'feedback');
  assert.equal(typeof feedbackPrefix.execute, 'function');
});

test('slash feedback command exports expected metadata', () => {
  const feedbackSlash = require('../src/slashCommands/feedbackslashcommand');
  assert.equal(feedbackSlash.data.name, 'feedback');
  assert.equal(typeof feedbackSlash.execute, 'function');
});

test('slash feedback command exposes ticket feedback delivery helper', () => {
  const feedbackSlash = require('../src/slashCommands/feedbackslashcommand');
  assert.equal(typeof feedbackSlash.sendTicketFeedbackPrompt, 'function');
});

test('slash feedback command configures feedback channel instead of sending a panel', async () => {
  const feedbackSlash = require('../src/slashCommands/feedbackslashcommand');
  const replies = [];
  const interaction = {
    options: { getChannel: () => null },
    reply: async (payload) => {
      replies.push(payload);
      return payload;
    },
  };

  await feedbackSlash.execute(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].components, undefined);
});

test('premium helpers add branded separators and styling', () => {
  const styled = buildPremiumDescription('نص تجريبي');
  assert.match(styled, /✨/);
  assert.match(styled, /💫/);
  assert.match(styled, /نص تجريبي/);

  const embed = errorEmbed('رسالة تجريبية');
  assert.equal(embed.data.author.name, 'OnlyZoro');
  assert.match(embed.data.footer.text, /OnlyZoro/);
});
