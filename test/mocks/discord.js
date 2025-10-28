import { vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock Discord.js Collection
class MockCollection extends Map {
  constructor(entries) {
    super(entries);
  }

  find(fn) {
    for (const [key, val] of this) {
      if (fn(val, key, this)) return val;
    }
    return undefined;
  }

  filter(fn) {
    const results = new MockCollection();
    for (const [key, val] of this) {
      if (fn(val, key, this)) results.set(key, val);
    }
    return results;
  }

  map(fn) {
    const results = [];
    for (const [key, val] of this) {
      results.push(fn(val, key, this));
    }
    return results;
  }

  some(fn) {
    for (const [key, val] of this) {
      if (fn(val, key, this)) return true;
    }
    return false;
  }

  every(fn) {
    for (const [key, val] of this) {
      if (!fn(val, key, this)) return false;
    }
    return true;
  }

  first(amount) {
    if (typeof amount === 'undefined') return this.values().next().value;
    if (amount < 0) return this.last(amount * -1);
    amount = Math.min(this.size, amount);
    const iter = this.values();
    return Array.from({ length: amount }, () => iter.next().value);
  }

  last(amount) {
    const arr = [...this.values()];
    if (typeof amount === 'undefined') return arr[arr.length - 1];
    if (amount < 0) return this.first(amount * -1);
    if (!amount) return [];
    return arr.slice(-amount);
  }

  random(amount) {
    const arr = [...this.values()];
    if (typeof amount === 'undefined') return arr[Math.floor(Math.random() * arr.length)];
    if (!arr.length || !amount) return [];
    return Array.from(
      { length: Math.min(amount, arr.length) },
      () => arr.splice(Math.floor(Math.random() * arr.length), 1)[0]
    );
  }
}

// Mock User
class MockUser {
  constructor(data = {}) {
    this.id = data.id || '123456789012345678';
    this.username = data.username || 'testuser';
    this.discriminator = data.discriminator || '0001';
    this.tag = `${this.username}#${this.discriminator}`;
    this.bot = data.bot || false;
    this.system = data.system || false;
    this.flags = data.flags || null;
    this.avatar = data.avatar || null;
    this.banner = data.banner || null;
    this.accentColor = data.accentColor || null;
    this.createdTimestamp = data.createdTimestamp || Date.now();
    this.defaultAvatarURL = 'https://cdn.discordapp.com/embed/avatars/0.png';
    this.dmChannel = null;
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  avatarURL(options = {}) {
    if (!this.avatar) return this.defaultAvatarURL;
    return `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.${options.format || 'webp'}`;
  }

  displayAvatarURL(options = {}) {
    return this.avatarURL(options);
  }

  toString() {
    return `<@${this.id}>`;
  }

  async createDM() {
    if (!this.dmChannel) {
      this.dmChannel = new MockDMChannel({ recipient: this });
    }
    return this.dmChannel;
  }

  async send(options) {
    const dm = await this.createDM();
    return dm.send(options);
  }
}

// Mock GuildMember
class MockGuildMember {
  constructor(guild, user, data = {}) {
    this.guild = guild;
    this.user = user;
    this.id = user.id;
    this.nickname = data.nickname || null;
    this.roles = new MockGuildMemberRoleManager(this, data.roles || []);
    this.joinedTimestamp = data.joinedTimestamp || Date.now();
    this.premiumSinceTimestamp = data.premiumSinceTimestamp || null;
    this.permissions = data.permissions || new MockPermissions();
    this.manageable = data.manageable !== false;
    this.bannable = data.bannable !== false;
    this.kickable = data.kickable !== false;
    this.moderatable = data.moderatable !== false;
  }

  get displayName() {
    return this.nickname || this.user.username;
  }

  get joinedAt() {
    return new Date(this.joinedTimestamp);
  }

  get premiumSince() {
    return this.premiumSinceTimestamp ? new Date(this.premiumSinceTimestamp) : null;
  }

  async ban(options = {}) {
    if (!this.bannable) {
      throw new Error('Missing Permissions');
    }
    return { user: this.user, reason: options.reason };
  }

  async kick(reason) {
    if (!this.kickable) {
      throw new Error('Missing Permissions');
    }
    return this;
  }

  async timeout(time, reason) {
    if (!this.moderatable) {
      throw new Error('Missing Permissions');
    }
    return this;
  }

  toString() {
    return `<@${this.id}>`;
  }
}

// Mock Role
class MockRole {
  constructor(guild, data = {}) {
    this.guild = guild;
    this.id = data.id || '123456789012345678';
    this.name = data.name || 'Test Role';
    this.color = data.color || 0;
    this.hoist = data.hoist || false;
    this.position = data.position || 0;
    this.permissions = data.permissions || new MockPermissions();
    this.managed = data.managed || false;
    this.mentionable = data.mentionable || false;
    this.createdTimestamp = data.createdTimestamp || Date.now();
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  toString() {
    return `<@&${this.id}>`;
  }
}

// Mock Permissions
class MockPermissions {
  constructor(bits = 0n) {
    this.bitfield = BigInt(bits);
  }

  has(permission, checkAdmin = true) {
    if (checkAdmin && this.has('Administrator', false)) return true;
    const permissionBit = MockPermissions.FLAGS[permission];
    return (this.bitfield & permissionBit) === permissionBit;
  }

  missing(permissions, checkAdmin = true) {
    return permissions.filter(perm => !this.has(perm, checkAdmin));
  }

  add(...permissions) {
    let total = this.bitfield;
    for (const permission of permissions) {
      total |= MockPermissions.FLAGS[permission];
    }
    return new MockPermissions(total);
  }

  remove(...permissions) {
    let total = this.bitfield;
    for (const permission of permissions) {
      total &= ~MockPermissions.FLAGS[permission];
    }
    return new MockPermissions(total);
  }

  static FLAGS = {
    CreateInstantInvite: 1n << 0n,
    KickMembers: 1n << 1n,
    BanMembers: 1n << 2n,
    Administrator: 1n << 3n,
    ManageChannels: 1n << 4n,
    ManageGuild: 1n << 5n,
    AddReactions: 1n << 6n,
    ViewAuditLog: 1n << 7n,
    PrioritySpeaker: 1n << 8n,
    Stream: 1n << 9n,
    ViewChannel: 1n << 10n,
    SendMessages: 1n << 11n,
    SendTTSMessages: 1n << 12n,
    ManageMessages: 1n << 13n,
    EmbedLinks: 1n << 14n,
    AttachFiles: 1n << 15n,
    ReadMessageHistory: 1n << 16n,
    MentionEveryone: 1n << 17n,
    UseExternalEmojis: 1n << 18n,
    ViewGuildInsights: 1n << 19n,
    Connect: 1n << 20n,
    Speak: 1n << 21n,
    MuteMembers: 1n << 22n,
    DeafenMembers: 1n << 23n,
    MoveMembers: 1n << 24n,
    UseVAD: 1n << 25n,
    ChangeNickname: 1n << 26n,
    ManageNicknames: 1n << 27n,
    ManageRoles: 1n << 28n,
    ManageWebhooks: 1n << 29n,
    ManageEmojisAndStickers: 1n << 30n,
    UseApplicationCommands: 1n << 31n,
    RequestToSpeak: 1n << 32n,
    ManageEvents: 1n << 33n,
    ManageThreads: 1n << 34n,
    CreatePublicThreads: 1n << 35n,
    CreatePrivateThreads: 1n << 36n,
    UseExternalStickers: 1n << 37n,
    SendMessagesInThreads: 1n << 38n,
    UseEmbeddedActivities: 1n << 39n,
    ModerateMembers: 1n << 40n
  };
}

// Mock Channel classes
class MockChannel extends EventEmitter {
  constructor(data = {}) {
    super();
    this.id = data.id || '123456789012345678';
    this.type = data.type || 0;
    this.createdTimestamp = data.createdTimestamp || Date.now();
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  toString() {
    return `<#${this.id}>`;
  }
}

class MockTextChannel extends MockChannel {
  constructor(guild, data = {}) {
    super(data);
    this.guild = guild;
    this.name = data.name || 'test-channel';
    this.topic = data.topic || null;
    this.nsfw = data.nsfw || false;
    this.lastMessageId = data.lastMessageId || null;
    this.rateLimitPerUser = data.rateLimitPerUser || 0;
    this.messages = new MockMessageManager(this);
    this.permissionOverwrites = new MockCollection();
    this.type = 0; // GUILD_TEXT
  }

  async send(options) {
    const message = new MockMessage(this, options);
    this.messages.cache.set(message.id, message);
    return message;
  }

  async bulkDelete(messages, filterOld = false) {
    const deleted = new MockCollection();
    let messageIds;
    
    if (Array.isArray(messages)) {
      messageIds = messages;
    } else if (typeof messages === 'number') {
      // If it's a number, get that many messages from cache
      messageIds = Array.from(this.messages.cache.keys()).slice(0, messages);
    } else {
      messageIds = [messages];
    }
    
    for (const messageId of messageIds) {
      const message = this.messages.cache.get(messageId);
      if (message) {
        deleted.set(messageId, message);
        this.messages.cache.delete(messageId);
      }
    }
    return deleted;
  }

  async createInvite(options = {}) {
    return new MockInvite(this, options);
  }

  permissionsFor(memberOrRole) {
    return new MockPermissions(MockPermissions.FLAGS.Administrator);
  }
}

class MockDMChannel extends MockChannel {
  constructor(data = {}) {
    super(data);
    this.recipient = data.recipient;
    this.messages = new MockMessageManager(this);
    this.type = 1; // DM
  }

  async send(options) {
    const message = new MockMessage(this, options);
    this.messages.cache.set(message.id, message);
    return message;
  }
}

class MockForumChannel extends MockChannel {
  constructor(guild, data = {}) {
    super(data);
    this.guild = guild;
    this.name = data.name || 'test-forum';
    this.topic = data.topic || null;
    this.nsfw = data.nsfw || false;
    this.threads = new MockThreadManager(this);
    this.type = 15; // GUILD_FORUM
  }

  async threads() {
    return {
      create: async (options) => {
        const thread = new MockThreadChannel(this.guild, {
          name: options.name,
          parent: this,
          ...options
        });
        this.threads.cache.set(thread.id, thread);
        return thread;
      }
    };
  }
}

class MockThreadChannel extends MockTextChannel {
  constructor(guild, data = {}) {
    super(guild, data);
    this.parent = data.parent;
    this.ownerId = data.ownerId || '123456789012345678';
    this.archived = data.archived || false;
    this.locked = data.locked || false;
    this.type = 11; // GUILD_PUBLIC_THREAD
  }

  async setArchived(archived = true) {
    this.archived = archived;
    return this;
  }

  async setLocked(locked = true) {
    this.locked = locked;
    return this;
  }
}

// Mock Message
class MockMessage {
  constructor(channel, options = {}) {
    this.id = options.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.channel = channel;
    this.guild = channel.guild || null;
    this.author = options.author || new MockUser();
    this.member = this.guild ? new MockGuildMember(this.guild, this.author) : null;
    this.content = typeof options === 'string' ? options : (options.content || '');
    this.embeds = options.embeds || [];
    this.attachments = new MockCollection();
    this.reactions = new MockReactionManager(this);
    this.createdTimestamp = Date.now();
    this.editedTimestamp = null;
    this.pinned = false;
    this.system = false;
    this.deletable = true;
    this.editable = true;
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  get editedAt() {
    return this.editedTimestamp ? new Date(this.editedTimestamp) : null;
  }

  async delete() {
    if (!this.deletable) {
      throw new Error('Missing Permissions');
    }
    this.channel.messages.cache.delete(this.id);
    return this;
  }

  async edit(options) {
    if (!this.editable) {
      throw new Error('Missing Permissions');
    }
    if (typeof options === 'string') {
      this.content = options;
    } else {
      this.content = options.content || this.content;
      this.embeds = options.embeds || this.embeds;
    }
    this.editedTimestamp = Date.now();
    return this;
  }

  async react(emoji) {
    return this.reactions.add(emoji);
  }

  async reply(options) {
    return this.channel.send(options);
  }
}

// Mock Managers
class MockGuildMemberManager {
  constructor(guild) {
    this.guild = guild;
    this.cache = new MockCollection();
  }

  async fetch(id) {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }
    const user = new MockUser({ id });
    const member = new MockGuildMember(this.guild, user);
    this.cache.set(id, member);
    return member;
  }

  async ban(user, options = {}) {
    const member = await this.fetch(user.id || user);
    return member.ban(options);
  }

  async kick(user, reason) {
    const member = await this.fetch(user.id || user);
    return member.kick(reason);
  }
}

class MockGuildMemberRoleManager {
  constructor(member, roles = []) {
    this.member = member;
    this.cache = new MockCollection();
    roles.forEach(role => this.cache.set(role.id, role));
  }

  async add(role, reason) {
    const roleObj = typeof role === 'string' ? { id: role } : role;
    this.cache.set(roleObj.id, roleObj);
    return this.member;
  }

  async remove(role, reason) {
    const roleId = typeof role === 'string' ? role : role.id;
    this.cache.delete(roleId);
    return this.member;
  }

  has(role) {
    const roleId = typeof role === 'string' ? role : role.id;
    return this.cache.has(roleId);
  }
}

class MockChannelManager {
  constructor(guild) {
    this.guild = guild;
    this.cache = new MockCollection();
  }

  async create(options) {
    let channel;
    switch (options.type) {
      case 15: // GUILD_FORUM
        channel = new MockForumChannel(this.guild, options);
        break;
      default:
        channel = new MockTextChannel(this.guild, options);
    }
    this.cache.set(channel.id, channel);
    return channel;
  }

  async fetch(id) {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }
    const channel = new MockTextChannel(this.guild, { id });
    this.cache.set(id, channel);
    return channel;
  }
}

class MockRoleManager {
  constructor(guild) {
    this.guild = guild;
    this.cache = new MockCollection();
    
    // Add @everyone role
    const everyoneRole = new MockRole(guild, {
      id: guild.id,
      name: '@everyone',
      position: 0
    });
    this.cache.set(guild.id, everyoneRole);
  }

  async create(options) {
    const role = new MockRole(this.guild, options);
    this.cache.set(role.id, role);
    return role;
  }

  async fetch(id) {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }
    const role = new MockRole(this.guild, { id });
    this.cache.set(id, role);
    return role;
  }

  get everyone() {
    return this.cache.get(this.guild.id);
  }
}

class MockMessageManager {
  constructor(channel) {
    this.channel = channel;
    this.cache = new MockCollection();
  }

  async fetch(id) {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }
    const message = new MockMessage(this.channel, { id });
    this.cache.set(id, message);
    return message;
  }
}

class MockReactionManager {
  constructor(message) {
    this.message = message;
    this.cache = new MockCollection();
  }

  async add(emoji) {
    const reaction = { emoji, count: 1, me: true };
    this.cache.set(emoji, reaction);
    return reaction;
  }

  async removeAll() {
    this.cache.clear();
    return this.message;
  }
}

class MockThreadManager {
  constructor(channel) {
    this.channel = channel;
    this.cache = new MockCollection();
  }

  async create(options) {
    const thread = new MockThreadChannel(this.channel.guild, {
      ...options,
      parent: this.channel
    });
    this.cache.set(thread.id, thread);
    return thread;
  }
}

// Mock Guild
class MockGuild extends EventEmitter {
  constructor(client, data = {}) {
    super();
    this.client = client;
    this.id = data.id || '123456789012345678';
    this.name = data.name || 'Test Guild';
    this.icon = data.icon || null;
    this.splash = data.splash || null;
    this.banner = data.banner || null;
    this.description = data.description || null;
    this.verificationLevel = data.verificationLevel || 0;
    this.vanityURLCode = data.vanityURLCode || null;
    this.nsfwLevel = data.nsfwLevel || 0;
    this.premiumTier = data.premiumTier || 0;
    this.premiumSubscriptionCount = data.premiumSubscriptionCount || 0;
    this.memberCount = data.memberCount || 1;
    this.large = data.large || false;
    this.features = data.features || [];
    this.applicationId = data.applicationId || null;
    this.systemChannelId = data.systemChannelId || null;
    this.rulesChannelId = data.rulesChannelId || null;
    this.publicUpdatesChannelId = data.publicUpdatesChannelId || null;
    this.preferredLocale = data.preferredLocale || 'en-US';
    this.ownerId = data.ownerId || '123456789012345678';
    this.afkChannelId = data.afkChannelId || null;
    this.afkTimeout = data.afkTimeout || 300;
    this.widgetEnabled = data.widgetEnabled || false;
    this.widgetChannelId = data.widgetChannelId || null;
    this.explicitContentFilter = data.explicitContentFilter || 0;
    this.mfaLevel = data.mfaLevel || 0;
    this.joinedTimestamp = data.joinedTimestamp || Date.now();
    this.defaultMessageNotifications = data.defaultMessageNotifications || 0;
    this.maximumMembers = data.maximumMembers || 500000;
    this.maximumPresences = data.maximumPresences || null;
    this.maxVideoChannelUsers = data.maxVideoChannelUsers || 25;
    this.approximateMemberCount = data.approximateMemberCount || null;
    this.approximatePresenceCount = data.approximatePresenceCount || null;
    this.vanityURLUses = data.vanityURLUses || null;
    this.premiumProgressBarEnabled = data.premiumProgressBarEnabled || false;
    this.available = data.available !== false;
    this.shardId = data.shardId || 0;
    this.createdTimestamp = data.createdTimestamp || Date.now();

    // Managers
    this.members = new MockGuildMemberManager(this);
    this.channels = new MockChannelManager(this);
    this.roles = new MockRoleManager(this);
    this.bans = new MockCollection();
    this.invites = new MockCollection();
    this.me = null; // Will be set when client is ready
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  get joinedAt() {
    return new Date(this.joinedTimestamp);
  }

  get owner() {
    return this.members.cache.get(this.ownerId);
  }

  iconURL(options = {}) {
    if (!this.icon) return null;
    return `https://cdn.discordapp.com/icons/${this.id}/${this.icon}.${options.format || 'webp'}`;
  }

  toString() {
    return this.name;
  }
}

// Mock Invite
class MockInvite {
  constructor(channel, options = {}) {
    this.code = options.code || 'testinvite';
    this.guild = channel.guild;
    this.channel = channel;
    this.inviter = options.inviter || null;
    this.targetUser = options.targetUser || null;
    this.targetApplication = options.targetApplication || null;
    this.targetType = options.targetType || null;
    this.temporary = options.temporary || false;
    this.maxAge = options.maxAge || 86400;
    this.maxUses = options.maxUses || 0;
    this.uses = 0;
    this.createdTimestamp = Date.now();
    this.url = `https://discord.gg/${this.code}`;
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  toString() {
    return this.url;
  }
}

// Mock Client
class MockClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.token = null;
    this.user = null;
    this.readyTimestamp = null;
    this.guilds = new MockCollection();
    this.channels = new MockCollection();
    this.users = new MockCollection();
    this.application = null;
    this.ws = {
      status: 0,
      ping: 50
    };
    this.rest = {
      setToken: vi.fn()
    };
    this.options = options;
  }

  get readyAt() {
    return this.readyTimestamp ? new Date(this.readyTimestamp) : null;
  }

  get uptime() {
    return this.readyTimestamp ? Date.now() - this.readyTimestamp : null;
  }

  async login(token) {
    this.token = token;
    this.user = new MockUser({
      id: '987654321098765432',
      username: 'TestBot',
      discriminator: '0000',
      bot: true
    });
    this.readyTimestamp = Date.now();
    
    // Create a default guild for testing
    const guild = new MockGuild(this, {
      id: '123456789012345678',
      name: 'Test Guild'
    });
    this.guilds.set(guild.id, guild);
    
    // Set bot member in guild
    const botMember = new MockGuildMember(guild, this.user, {
      permissions: new MockPermissions(MockPermissions.FLAGS.Administrator)
    });
    guild.members.cache.set(this.user.id, botMember);
    guild.me = botMember;
    
    setTimeout(() => {
      this.emit('ready');
    }, 10);
    
    return this.token;
  }

  destroy() {
    this.removeAllListeners();
    this.token = null;
    this.user = null;
    this.readyTimestamp = null;
  }
}

// Mock SlashCommandBuilder and other builders
class MockSlashCommandBuilder {
  constructor() {
    this.name_value = '';
    this.description_value = '';
    this.options_value = [];
    this.default_member_permissions = null;
    this.dm_permission = null;
  }

  setName(name) {
    this.name_value = name;
    return this;
  }

  setDescription(description) {
    this.description_value = description;
    return this;
  }

  addStringOption(fn) {
    const option = new MockSlashCommandStringOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addUserOption(fn) {
    const option = new MockSlashCommandUserOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addIntegerOption(fn) {
    const option = new MockSlashCommandIntegerOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addBooleanOption(fn) {
    const option = new MockSlashCommandBooleanOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addChannelOption(fn) {
    const option = new MockSlashCommandChannelOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addSubcommand(fn) {
    const option = new MockSlashCommandSubcommandOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  setDefaultMemberPermissions(permissions) {
    this.default_member_permissions = permissions;
    return this;
  }

  setDMPermission(permission) {
    this.dm_permission = permission;
    return this;
  }

  toJSON() {
    return {
      name: this.name_value,
      description: this.description_value,
      options: this.options_value.map(opt => opt.toJSON()),
      default_member_permissions: this.default_member_permissions,
      dm_permission: this.dm_permission
    };
  }
}

class MockSlashCommandStringOption {
  constructor() {
    this.name_value = '';
    this.description_value = '';
    this.required_value = false;
    this.choices_value = [];
  }

  setName(name) {
    this.name_value = name;
    return this;
  }

  setDescription(description) {
    this.description_value = description;
    return this;
  }

  setRequired(required) {
    this.required_value = required;
    return this;
  }

  addChoices(...choices) {
    this.choices_value.push(...choices);
    return this;
  }

  toJSON() {
    return {
      type: 3, // STRING
      name: this.name_value,
      description: this.description_value,
      required: this.required_value,
      choices: this.choices_value
    };
  }
}

class MockSlashCommandUserOption {
  constructor() {
    this.name_value = '';
    this.description_value = '';
    this.required_value = false;
  }

  setName(name) {
    this.name_value = name;
    return this;
  }

  setDescription(description) {
    this.description_value = description;
    return this;
  }

  setRequired(required) {
    this.required_value = required;
    return this;
  }

  toJSON() {
    return {
      type: 6, // USER
      name: this.name_value,
      description: this.description_value,
      required: this.required_value
    };
  }
}

class MockSlashCommandIntegerOption {
  constructor() {
    this.name_value = '';
    this.description_value = '';
    this.required_value = false;
    this.min_value = null;
    this.max_value = null;
  }

  setName(name) {
    this.name_value = name;
    return this;
  }

  setDescription(description) {
    this.description_value = description;
    return this;
  }

  setRequired(required) {
    this.required_value = required;
    return this;
  }

  setMinValue(min) {
    this.min_value = min;
    return this;
  }

  setMaxValue(max) {
    this.max_value = max;
    return this;
  }

  toJSON() {
    return {
      type: 4, // INTEGER
      name: this.name_value,
      description: this.description_value,
      required: this.required_value,
      min_value: this.min_value,
      max_value: this.max_value
    };
  }
}

class MockSlashCommandBooleanOption {
  constructor() {
    this.name_value = '';
    this.description_value = '';
    this.required_value = false;
  }

  setName(name) {
    this.name_value = name;
    return this;
  }

  setDescription(description) {
    this.description_value = description;
    return this;
  }

  setRequired(required) {
    this.required_value = required;
    return this;
  }

  toJSON() {
    return {
      type: 5, // BOOLEAN
      name: this.name_value,
      description: this.description_value,
      required: this.required_value
    };
  }
}

class MockSlashCommandChannelOption {
  constructor() {
    this.name_value = '';
    this.description_value = '';
    this.required_value = false;
    this.channel_types = [];
  }

  setName(name) {
    this.name_value = name;
    return this;
  }

  setDescription(description) {
    this.description_value = description;
    return this;
  }

  setRequired(required) {
    this.required_value = required;
    return this;
  }

  addChannelTypes(...types) {
    this.channel_types.push(...types);
    return this;
  }

  toJSON() {
    return {
      type: 7, // CHANNEL
      name: this.name_value,
      description: this.description_value,
      required: this.required_value,
      channel_types: this.channel_types
    };
  }
}

class MockSlashCommandSubcommandOption {
  constructor() {
    this.name_value = '';
    this.description_value = '';
    this.options_value = [];
  }

  setName(name) {
    this.name_value = name;
    return this;
  }

  setDescription(description) {
    this.description_value = description;
    return this;
  }

  addStringOption(fn) {
    const option = new MockSlashCommandStringOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addUserOption(fn) {
    const option = new MockSlashCommandUserOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addIntegerOption(fn) {
    const option = new MockSlashCommandIntegerOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addBooleanOption(fn) {
    const option = new MockSlashCommandBooleanOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  addChannelOption(fn) {
    const option = new MockSlashCommandChannelOption();
    fn(option);
    this.options_value.push(option);
    return this;
  }

  toJSON() {
    return {
      type: 1, // SUB_COMMAND
      name: this.name_value,
      description: this.description_value,
      options: this.options_value.map(opt => opt.toJSON())
    };
  }
}

// Mock Interaction
class MockInteraction extends EventEmitter {
  constructor(data = {}) {
    super();
    this.id = data.id || '123456789012345678';
    this.type = data.type || 2; // APPLICATION_COMMAND
    this.commandName = data.commandName || 'test';
    this.user = data.user || new MockUser();
    this.member = data.member || null;
    this.guild = data.guild || null;
    this.channel = data.channel || null;
    this.token = data.token || 'mock_token';
    this.version = data.version || 1;
    this.applicationId = data.applicationId || '987654321098765432';
    this.replied = false;
    this.deferred = false;
    this.ephemeral = false;
    this.options = new MockCommandInteractionOptionResolver(data.options || []);
  }

  get createdTimestamp() {
    return parseInt(this.id) >> 22;
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  async reply(options) {
    if (this.replied || this.deferred) {
      throw new Error('Already replied');
    }
    this.replied = true;
    if (typeof options === 'object' && options.ephemeral) {
      this.ephemeral = true;
    }
    return new MockMessage(this.channel, options);
  }

  async editReply(options) {
    if (!this.replied && !this.deferred) {
      throw new Error('Not replied yet');
    }
    return new MockMessage(this.channel, options);
  }

  async deferReply(options = {}) {
    if (this.replied || this.deferred) {
      throw new Error('Already replied or deferred');
    }
    this.deferred = true;
    if (options.ephemeral) {
      this.ephemeral = true;
    }
  }

  async followUp(options) {
    if (!this.replied && !this.deferred) {
      throw new Error('Not replied yet');
    }
    return new MockMessage(this.channel, options);
  }
}

class MockCommandInteractionOptionResolver {
  constructor(options = []) {
    this._options = options;
  }

  getString(name, required = false) {
    const option = this._options.find(opt => opt.name === name);
    if (!option && required) {
      throw new Error(`Required option ${name} not found`);
    }
    return option ? option.value : null;
  }

  getUser(name, required = false) {
    const option = this._options.find(opt => opt.name === name);
    if (!option && required) {
      throw new Error(`Required option ${name} not found`);
    }
    return option ? new MockUser({ id: option.value }) : null;
  }

  getMember(name, required = false) {
    const user = this.getUser(name, required);
    return user ? new MockGuildMember(null, user) : null;
  }

  getInteger(name, required = false) {
    const option = this._options.find(opt => opt.name === name);
    if (!option && required) {
      throw new Error(`Required option ${name} not found`);
    }
    return option ? parseInt(option.value) : null;
  }

  getBoolean(name, required = false) {
    const option = this._options.find(opt => opt.name === name);
    if (!option && required) {
      throw new Error(`Required option ${name} not found`);
    }
    return option ? Boolean(option.value) : null;
  }

  getChannel(name, required = false) {
    const option = this._options.find(opt => opt.name === name);
    if (!option && required) {
      throw new Error(`Required option ${name} not found`);
    }
    return option ? new MockTextChannel(null, { id: option.value }) : null;
  }

  getRole(name, required = false) {
    const option = this._options.find(opt => opt.name === name);
    if (!option && required) {
      throw new Error(`Required option ${name} not found`);
    }
    return option ? new MockRole(null, { id: option.value }) : null;
  }

  getSubcommand(required = false) {
    const subcommand = this._options.find(opt => opt.type === 1); // SUB_COMMAND
    if (!subcommand && required) {
      throw new Error('Required subcommand not found');
    }
    return subcommand ? subcommand.name : null;
  }
}

// Mock EmbedBuilder
class MockEmbedBuilder {
  constructor(data = {}) {
    this.data = { ...data };
  }

  setTitle(title) {
    this.data.title = title;
    return this;
  }

  setDescription(description) {
    this.data.description = description;
    return this;
  }

  setColor(color) {
    this.data.color = color;
    return this;
  }

  setAuthor(options) {
    this.data.author = options;
    return this;
  }

  setFooter(options) {
    this.data.footer = options;
    return this;
  }

  setTimestamp(timestamp) {
    this.data.timestamp = timestamp || new Date().toISOString();
    return this;
  }

  setThumbnail(url) {
    this.data.thumbnail = { url };
    return this;
  }

  setImage(url) {
    this.data.image = { url };
    return this;
  }

  addFields(...fields) {
    if (!this.data.fields) this.data.fields = [];
    this.data.fields.push(...fields);
    return this;
  }

  toJSON() {
    return this.data;
  }
}

// Export all mocks with both names for compatibility
export const Client = MockClient;
export const Guild = MockGuild;
export const User = MockUser;
export const GuildMember = MockGuildMember;
export const Role = MockRole;
export const TextChannel = MockTextChannel;
export const DMChannel = MockDMChannel;
export const ForumChannel = MockForumChannel;
export const ThreadChannel = MockThreadChannel;
export const Message = MockMessage;
export const Collection = MockCollection;
export const PermissionsBitField = MockPermissions;
export const SlashCommandBuilder = MockSlashCommandBuilder;
export const CommandInteraction = MockInteraction;
export const EmbedBuilder = MockEmbedBuilder;
export const Invite = MockInvite;

// Also export with Mock prefix for test utilities
export {
  MockClient,
  MockGuild,
  MockUser,
  MockGuildMember,
  MockRole,
  MockTextChannel,
  MockDMChannel,
  MockForumChannel,
  MockThreadChannel,
  MockMessage,
  MockCollection,
  MockPermissions,
  MockSlashCommandBuilder,
  MockInteraction,
  MockEmbedBuilder,
  MockInvite
};

// Export permission flags
export const PermissionFlagsBits = MockPermissions.FLAGS;

// Export channel types
export const ChannelType = {
  GuildText: 0,
  DM: 1,
  GuildVoice: 2,
  GroupDM: 3,
  GuildCategory: 4,
  GuildAnnouncement: 5,
  AnnouncementThread: 10,
  PublicThread: 11,
  PrivateThread: 12,
  GuildStageVoice: 13,
  GuildDirectory: 14,
  GuildForum: 15
};

// Export interaction types
export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  ApplicationCommandAutocomplete: 4,
  ModalSubmit: 5
};

// Export application command types
export const ApplicationCommandType = {
  ChatInput: 1,
  User: 2,
  Message: 3
};