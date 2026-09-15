"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertMediaContent = exports.downloadMediaMessage = exports.aggregateMessageKeysNotFromMe = exports.getAggregateVotesInPollMessage = exports.updateMessageWithPollUpdate = exports.updateMessageWithReaction = exports.updateMessageWithReceipt = exports.getDevice = exports.extractMessageContent = exports.normalizeMessageContent = exports.getContentType = exports.generateWAMessage = exports.generateWAMessageFromContent = exports.generateWAMessageContent = exports.generateForwardMessageContent = exports.prepareDisappearingMessageSettingContent = exports.prepareWAMessageMedia = exports.generateLinkPreviewIfRequired = exports.extractUrlFromText = void 0;

const boom_1 = require("@hapi/boom");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const Types_1 = require("../Types");
const WABinary_1 = require("../WABinary");
const crypto_2 = require("./crypto");
const generics_1 = require("./generics");
const messages_media_1 = require("./messages-media");
const AIRich = require("./AIRich-messages");

const MIMETYPE_MAP = {
    image: 'image/jpeg',
    video: 'video/mp4',
    document: 'application/pdf',
    audio: 'audio/ogg; codecs=opus',
    sticker: 'image/webp',
    'product-catalog-image': 'image/jpeg',
    heic: 'image/heic',
};

const MessageTypeProto = {
    'image': Types_1.WAProto.Message.ImageMessage,
    'video': Types_1.WAProto.Message.VideoMessage,
    'audio': Types_1.WAProto.Message.AudioMessage,
    'sticker': Types_1.WAProto.Message.StickerMessage,
    'document': Types_1.WAProto.Message.DocumentMessage,
    'heic': Types_1.WAProto.Message.ImageMessage,
};

const ButtonType = WAProto_1.proto.Message.ButtonsMessage.HeaderType;

const extractUrlFromText = (text) => text.match(Defaults_1.URL_REGEX)?.[0];
exports.extractUrlFromText = extractUrlFromText;

const generateLinkPreviewIfRequired = async (text, getUrlInfo, logger) => {
    const url = (0, exports.extractUrlFromText)(text);

    if (!!getUrlInfo && url) {
        try {
            const urlInfo = await getUrlInfo(url);
            return urlInfo;
        } catch (error) {
            logger?.warn({ trace: error.stack }, 'url generation failed');
        }
    }
};
exports.generateLinkPreviewIfRequired = generateLinkPreviewIfRequired;

const assertColor = async (color) => {
    let assertedColor;

    if (typeof color === 'number') {
        assertedColor = color > 0 ? color : 0xffffffff + Number(color) + 1;
    } else {
        let hex = color.trim().replace('#', '');

        if (hex.length <= 6) {
            hex = 'FF' + hex.padStart(6, '0');
        }

        assertedColor = parseInt(hex, 16);
    }

    return assertedColor;
};

const prepareWAMessageMedia = async (message, options) => {
    const logger = options.logger;
    let mediaType;

    for (const key of Defaults_1.MEDIA_KEYS) {
        if (key in message && message[key] != null) {
            mediaType = key;
            break;
        }
    }

    if (!mediaType) {
        const availableKeys = Object.keys(message).join(', ');
        throw new boom_1.Boom(
            `Invalid media type. Expected one of [${Defaults_1.MEDIA_KEYS.join(', ')}], but received keys: [${availableKeys}]`,
            { statusCode: 400 }
        );
    }

    const uploadData = {
        ...message,
        annotations: message.annotations,
        media: message[mediaType]
    };

    delete uploadData[mediaType];

    const cacheableKey = typeof uploadData.media === 'object' &&
        ('url' in uploadData.media) &&
        !!uploadData.media.url &&
        !!options.mediaCache &&
        (mediaType + ':' + uploadData.media.url.toString());

    if (mediaType === 'document' && !uploadData.fileName) {
        uploadData.fileName = 'file';
    }

    if (!uploadData.mimetype) {
        uploadData.mimetype = MIMETYPE_MAP[mediaType];
    }

    if (cacheableKey) {
        const mediaBuff = options.mediaCache.get(cacheableKey);

        if (mediaBuff) {
            logger?.debug({ cacheableKey }, 'got media cache hit');

            const obj = Types_1.WAProto.Message.decode(mediaBuff);
            const key = `${mediaType}Message`;

            Object.assign(obj[key], { ...uploadData, media: undefined });

            return obj;
        }
    }

    const requiresDurationComputation = mediaType === 'audio' && typeof uploadData.seconds === 'undefined';
    const requiresThumbnailComputation = (mediaType === 'image' || mediaType === 'video' || mediaType === 'heic') &&
        (typeof uploadData['jpegThumbnail'] === 'undefined');
    const requiresWaveformProcessing = mediaType === 'audio' && uploadData.ptt === true;
    const requiresAudioBackground = options.backgroundColor && mediaType === 'audio' && uploadData.ptt === true;
    const requiresOriginalForSomeProcessing = requiresDurationComputation || requiresThumbnailComputation;

    const {
        mediaKey,
        encWriteStream,
        bodyPath,
        fileEncSha256,
        fileSha256,
        fileLength,
        didSaveToTmpPath,
        opusConverted
    } = await (options.newsletter ? messages_media_1.prepareStream : messages_media_1.encryptedStream)(
        uploadData.media,
        options.mediaTypeOverride || mediaType,
        {
            logger,
            saveOriginalFileIfRequired: requiresOriginalForSomeProcessing,
            opts: options.options,
            isPtt: uploadData.ptt,
            forceOpus: (mediaType === "audio" && uploadData.mimetype && uploadData.mimetype.includes('opus'))
        }
    );

    if (mediaType === 'audio' && opusConverted) {
        uploadData.mimetype = 'audio/ogg; codecs=opus';
    }

    const fileEncSha256B64 = (options.newsletter ? fileSha256 : fileEncSha256 ?? fileSha256).toString('base64');

    const [{ mediaUrl, directPath, handle }] = await Promise.all([
        (async () => {
            const result = await options.upload(encWriteStream, {
                fileEncSha256B64,
                mediaType,
                timeoutMs: options.mediaUploadTimeoutMs
            });
            logger?.debug({ mediaType, cacheableKey }, 'uploaded media');
            return result;
        })(),
        (async () => {
            try {
                if (requiresThumbnailComputation) {
                    const { thumbnail, originalImageDimensions } = await (0, messages_media_1.generateThumbnail)(
                        bodyPath,
                        mediaType,
                        options
                    );
                    uploadData.jpegThumbnail = thumbnail;

                    if (!uploadData.width && originalImageDimensions) {
                        uploadData.width = originalImageDimensions.width;
                        uploadData.height = originalImageDimensions.height;
                        logger?.debug('set dimensions');
                    }

                    logger?.debug('generated thumbnail');
                }

                if (requiresDurationComputation) {
                    uploadData.seconds = await (0, messages_media_1.getAudioDuration)(bodyPath);
                    logger?.debug('computed audio duration');
                }

                if (requiresWaveformProcessing) {
                    uploadData.waveform = await (0, messages_media_1.getAudioWaveform)(bodyPath, logger);
                    logger?.debug('processed waveform');
                }

                if (requiresAudioBackground) {
                    uploadData.backgroundArgb = await assertColor(options.backgroundColor);
                    logger?.debug('computed backgroundColor audio status');
                }
            } catch (error) {
                logger?.warn({ trace: error.stack }, 'failed to obtain extra info');
            }
        })(),
    ])
    .finally(async () => {
        if (!Buffer.isBuffer(encWriteStream)) {
            encWriteStream.destroy();
        }

        if (didSaveToTmpPath && bodyPath) {
            await fs_1.promises.unlink(bodyPath);
            logger?.debug('removed tmp files');
        }
    });

    const mediaMessage = {
        url: handle ? undefined : mediaUrl,
        directPath,
        mediaKey: mediaKey,
        fileEncSha256: fileEncSha256,
        fileSha256,
        fileLength,
        mediaKeyTimestamp: handle ? undefined : (0, generics_1.unixTimestampSeconds)(),
        ...uploadData,
        media: undefined
    };

    if (uploadData.annotations) {
        mediaMessage.annotations = uploadData.annotations;
    }

    const protoKey = mediaType === 'heic' ? 'imageMessage' : `${mediaType}Message`;
    const ProtoCtor = MessageTypeProto[mediaType];

    if (!ProtoCtor) {
        throw new boom_1.Boom(`Unsupported media type for proto: ${mediaType}`, { statusCode: 400 });
    }

    const obj = Types_1.WAProto.Message.fromObject({
        [protoKey]: ProtoCtor.fromObject(mediaMessage)
    });

    if (uploadData.ptv) {
        obj.ptvMessage = obj.videoMessage;
        delete obj.videoMessage;
    }

    if (cacheableKey) {
        logger?.debug({ cacheableKey }, 'set cache');
        options.mediaCache.set(cacheableKey, Types_1.WAProto.Message.encode(obj).finish());
    }

    return obj;
};
exports.prepareWAMessageMedia = prepareWAMessageMedia;

const prepareDisappearingMessageSettingContent = (ephemeralExpiration) => {
    ephemeralExpiration = ephemeralExpiration || 0;

    const content = {
        ephemeralMessage: {
            message: {
                protocolMessage: {
                    type: Types_1.WAProto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
                    ephemeralExpiration
                }
            }
        }
    };

    return Types_1.WAProto.Message.fromObject(content);
};
exports.prepareDisappearingMessageSettingContent = prepareDisappearingMessageSettingContent;

const generateForwardMessageContent = (message, forceForward) => {
    let content = message.message;

    if (!content) {
        throw new boom_1.Boom('no content in message', { statusCode: 400 });
    }

    content = (0, exports.normalizeMessageContent)(content);
    content = WAProto_1.proto.Message.decode(WAProto_1.proto.Message.encode(content).finish());

    let key = Object.keys(content)[0];
    let score = content[key].contextInfo?.forwardingScore || 0;
    score += message.key.fromMe && !forceForward ? 0 : 1;

    if (key === 'conversation') {
        content.extendedTextMessage = { text: content[key] };
        delete content.conversation;
        key = 'extendedTextMessage';
    }

    if (score > 0) {
        content[key].contextInfo = { forwardingScore: score, isForwarded: true };
    } else {
        content[key].contextInfo = {};
    }

    return content;
};
exports.generateForwardMessageContent = generateForwardMessageContent;

const generateWAMessageContent = async (message, options) => {
    let m = {};

    if ('text' in message) {
        const extContent = { text: message.text };
        let urlInfo = message.linkPreview;

        if (typeof urlInfo === 'undefined') {
            urlInfo = await (0, exports.generateLinkPreviewIfRequired)(message.text, options.getUrlInfo, options.logger);
        }

        if (urlInfo) {
            extContent.canonicalUrl = urlInfo['canonical-url'];
            extContent.matchedText = urlInfo['matched-text'];
            extContent.jpegThumbnail = urlInfo.jpegThumbnail;
            extContent.description = urlInfo.description;
            extContent.title = urlInfo.title;
            extContent.previewType = 0;

            const img = urlInfo.highQualityThumbnail;

            if (img) {
                extContent.thumbnailDirectPath = img.directPath;
                extContent.mediaKey = img.mediaKey;
                extContent.mediaKeyTimestamp = img.mediaKeyTimestamp;
                extContent.thumbnailWidth = img.width;
                extContent.thumbnailHeight = img.height;
                extContent.thumbnailSha256 = img.fileSha256;
                extContent.thumbnailEncSha256 = img.fileEncSha256;
            }
        }

        if (options.backgroundColor) {
            extContent.backgroundArgb = await assertColor(options.backgroundColor);
        }

        if (options.font) {
            extContent.font = options.font;
        }

        m.extendedTextMessage = extContent;
    } else if ('contacts' in message) {
        const contactLen = message.contacts.contacts.length;

        if (!contactLen) {
            throw new boom_1.Boom('require atleast 1 contact', { statusCode: 400 });
        }

        if (contactLen === 1) {
            m.contactMessage = Types_1.WAProto.Message.ContactMessage.fromObject(message.contacts.contacts[0]);
        } else {
            m.contactsArrayMessage = Types_1.WAProto.Message.ContactsArrayMessage.fromObject(message.contacts);
        }
    } else if ('location' in message) {
        m.locationMessage = Types_1.WAProto.Message.LocationMessage.fromObject(message.location);
    } else if ('react' in message) {
        if (!message.react.senderTimestampMs) {
            message.react.senderTimestampMs = Date.now();
        }
        m.reactionMessage = Types_1.WAProto.Message.ReactionMessage.fromObject(message.react);
    } else if ('delete' in message) {
        m.protocolMessage = {
            key: message.delete,
            type: Types_1.WAProto.Message.ProtocolMessage.Type.REVOKE
        };
    } else if ('forward' in message) {
        m = (0, exports.generateForwardMessageContent)(message.forward, message.force);
    } else if ('disappearingMessagesInChat' in message) {
        const exp = typeof message.disappearingMessagesInChat === 'boolean'
            ? (message.disappearingMessagesInChat ? Defaults_1.WA_DEFAULT_EPHEMERAL : 0)
            : message.disappearingMessagesInChat;

        m = (0, exports.prepareDisappearingMessageSettingContent)(exp);
    } else if ('buttonReply' in message) {
        switch (message.type) {
            case 'template':
                m.templateButtonReplyMessage = {
                    selectedDisplayText: message.buttonReply.displayText,
                    selectedId: message.buttonReply.id,
                    selectedIndex: message.buttonReply.index,
                };
                break;

            case 'plain':
                m.buttonsResponseMessage = {
                    selectedButtonId: message.buttonReply.id,
                    selectedDisplayText: message.buttonReply.displayText,
                    type: WAProto_1.proto.Message.ButtonsResponseMessage.Type.DISPLAY_TEXT,
                };
                break;
        }
    } else if ('product' in message) {
        const mediaMsg = await (0, exports.prepareWAMessageMedia)({ image: message.product.productImage }, options);
        const imageMessage = mediaMsg.imageMessage;

        m.productMessage = Types_1.WAProto.Message.ProductMessage.fromObject({
            ...message,
            product: {
                ...message.product,
                productImage: imageMessage,
            }
        });
    } else if ('listReply' in message) {
        m.listResponseMessage = { ...message.listReply };
    } else if ('poll' in message) {
        message.poll.selectableCount ||= 0;

        if (!Array.isArray(message.poll.values)) {
            throw new boom_1.Boom('Invalid poll values', { statusCode: 400 });
        }

        if (
            message.poll.selectableCount < 0 ||
            message.poll.selectableCount > message.poll.values.length
        ) {
            throw new boom_1.Boom(
                `poll.selectableCount in poll should be >= 0 and <= ${message.poll.values.length}`,
                { statusCode: 400 }
            );
        }

        m.messageContextInfo = {
            messageSecret: message.poll.messageSecret || (0, crypto_1.randomBytes)(32),
        };

        m.pollCreationMessage = {
            name: message.poll.name,
            selectableOptionsCount: message.poll.selectableCount,
            options: message.poll.values.map(optionName => ({ optionName })),
        };
    } else if ('sharePhoneNumber' in message) {
        m.protocolMessage = {
            type: WAProto_1.proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER
        };
    } else if ('requestPhoneNumber' in message) {
        m.requestPhoneNumberMessage = {};
    } else {
        const protoMessageKeys = Object.keys(message).filter(k =>
            k.endsWith('Message') &&
            !['senderKeyDistributionMessage', 'messageContextInfo'].includes(k)
        );

        const hasValidMedia = Defaults_1.MEDIA_KEYS.some(key => key in message && message[key] != null);

        if (!hasValidMedia && protoMessageKeys.length > 0) {
            m = message;
        } else if (!hasValidMedia) {
            const availableKeys = Object.keys(message).join(', ');
            throw new boom_1.Boom(
                `Invalid message content. Expected media type (${Defaults_1.MEDIA_KEYS.join(', ')}) or known message type, but got: [${availableKeys}]`,
                { statusCode: 400 }
            );
        } else {
            m = await (0, exports.prepareWAMessageMedia)(message, options);
        }
    }

    if ('buttons' in message && !!message.buttons) {
        const buttonsMessage = {
            buttons: message.buttons.map(b => ({
                ...b,
                type: WAProto_1.proto.Message.ButtonsMessage.Button.Type.RESPONSE
            }))
        };

        if ('text' in message) {
            buttonsMessage.contentText = message.text;
            buttonsMessage.headerType = ButtonType.EMPTY;
        } else {
            if ('caption' in message) {
                buttonsMessage.contentText = message.caption;
            }

            const type = Object.keys(m)[0].replace('Message', '').toUpperCase();
            buttonsMessage.headerType = ButtonType[type];
            Object.assign(buttonsMessage, m);
        }

        if ('footer' in message && !!message.footer) {
            buttonsMessage.footerText = message.footer;
        }

        m = { buttonsMessage };
    } else if ('templateButtons' in message && !!message.templateButtons) {
        const msg = {
            hydratedButtons: message.templateButtons
        };

        if ('text' in message) {
            msg.hydratedContentText = message.text;
        } else {
            if ('caption' in message) {
                msg.hydratedContentText = message.caption;
            }
            Object.assign(msg, m);
        }

        if ('footer' in message && !!message.footer) {
            msg.hydratedFooterText = message.footer;
        }

        m = {
            templateMessage: {
                fourRowTemplate: msg,
                hydratedTemplate: msg
            }
        };
    }

    if ('sections' in message && !!message.sections) {
        const listMessage = {
            sections: message.sections,
            buttonText: message.buttonText,
            title: message.title,
            footerText: message.footer,
            description: message.text,
            listType: WAProto_1.proto.Message.ListMessage.ListType.SINGLE_SELECT
        };

        m = { listMessage };
    }

    if ('viewOnce' in message && !!message.viewOnce) {
        m = { viewOnceMessage: { message: m } };
    }

    if ('mentions' in message && message.mentions?.length) {
        const [messageType] = Object.keys(m);
        m[messageType].contextInfo = m[messageType].contextInfo || {};
        m[messageType].contextInfo.mentionedJid = message.mentions;
    }

    if ('edit' in message) {
        m = {
            protocolMessage: {
                key: message.edit,
                editedMessage: m,
                timestampMs: Date.now(),
                type: Types_1.WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT
            }
        };
    }

    if ('contextInfo' in message && !!message.contextInfo) {
        const [messageType] = Object.keys(m);
        m[messageType] = m[messageType] || {};
        m[messageType].contextInfo = message.contextInfo;
    }

    return Types_1.WAProto.Message.fromObject(m);
};
exports.generateWAMessageContent = generateWAMessageContent;

const getContextTarget = (innerMessage, key) => {
    if (!key || !innerMessage) return null;

    if (key === 'botForwardedMessage') {
        const rich = innerMessage[key]?.message?.richResponseMessage;
        if (rich) return rich;
    }

    return innerMessage[key] || null;
};

const generateWAMessageFromContent = (jid, message, options) => {
    if (!options.timestamp) {
        options.timestamp = new Date();
    }

    const innerMessage = (0, exports.normalizeMessageContent)(message);
    const key = (0, exports.getContentType)(innerMessage);
    const timestamp = (0, generics_1.unixTimestampSeconds)(options.timestamp);
    const { quoted, userJid } = options;

    if (quoted && !(0, WABinary_1.isJidNewsletter)(jid)) {
        const participant = quoted.key.fromMe ? userJid : (quoted.participant || quoted.key.participant || quoted.key.remoteJid);
        let quotedMsg = (0, exports.normalizeMessageContent)(quoted.message);
        const msgType = (0, exports.getContentType)(quotedMsg);

        quotedMsg = WAProto_1.proto.Message.fromObject({ [msgType]: quotedMsg[msgType] });

        const quotedContent = quotedMsg[msgType];

        if (typeof quotedContent === 'object' && quotedContent && 'contextInfo' in quotedContent) {
            delete quotedContent.contextInfo;
        }

        const target = getContextTarget(innerMessage, key);

        if (target) {
            target.contextInfo = target.contextInfo || {};
            target.contextInfo.participant = (0, WABinary_1.jidNormalizedUser)(participant);
            target.contextInfo.stanzaId = quoted.key.id;
            target.contextInfo.quotedMessage = quotedMsg;

            if (jid !== quoted.key.remoteJid) {
                target.contextInfo.remoteJid = quoted.key.remoteJid;
            }
        }
    }

    if (
        !!options?.ephemeralExpiration &&
        key !== 'protocolMessage' &&
        key !== 'ephemeralMessage' &&
        !(0, WABinary_1.isJidNewsletter)(jid)
    ) {
        const target = getContextTarget(innerMessage, key);

        if (target) {
            target.contextInfo = {
                ...(target.contextInfo || {}),
                expiration: options.ephemeralExpiration || Defaults_1.WA_DEFAULT_EPHEMERAL,
            };
        }
    }

    message = Types_1.WAProto.Message.fromObject(message);

    const messageJSON = {
        key: {
            remoteJid: jid,
            fromMe: true,
            id: options?.messageId || (0, generics_1.generateMessageID)(),
        },
        message: message,
        messageTimestamp: timestamp,
        messageStubParameters: [],
        participant: (0, WABinary_1.isJidGroup)(jid) || (0, WABinary_1.isJidStatusBroadcast)(jid) ? userJid : undefined,
        status: Types_1.WAMessageStatus.PENDING
    };

    return Types_1.WAProto.WebMessageInfo.fromObject(messageJSON);
};
exports.generateWAMessageFromContent = generateWAMessageFromContent;

const generateWAMessage = async (jid, content, options) => {
    options = options || {};
    options.logger = options?.logger?.child({ msgId: options.messageId });

    return (0, exports.generateWAMessageFromContent)(
        jid,
        await (0, exports.generateWAMessageContent)(content, {
            newsletter: (0, WABinary_1.isJidNewsletter)(jid),
            ...options
        }),
        options
    );
};
exports.generateWAMessage = generateWAMessage;

const getContentType = (content) => {
    if (content) {
        const keys = Object.keys(content);
        const key = keys.find(k => (k === 'conversation' || k.includes('Message')) && k !== 'senderKeyDistributionMessage');
        return key;
    }
};
exports.getContentType = getContentType;

const normalizeMessageContent = (content) => {
    if (!content) {
        return undefined;
    }

    for (let i = 0; i < 5; i++) {
        const inner = getFutureProofMessage(content);

        if (!inner) {
            break;
        }

        content = inner.message;
    }

    return content;

    function getFutureProofMessage(message) {
        return (
            message?.ephemeralMessage ||
            message?.viewOnceMessage ||
            message?.documentWithCaptionMessage ||
            message?.viewOnceMessageV2 ||
            message?.viewOnceMessageV2Extension ||
            message?.editedMessage
        );
    }
};
exports.normalizeMessageContent = normalizeMessageContent;

const extractMessageContent = (content) => {
    const extractFromTemplateMessage = (msg) => {
        if (msg.imageMessage) {
            return { imageMessage: msg.imageMessage };
        } else if (msg.documentMessage) {
            return { documentMessage: msg.documentMessage };
        } else if (msg.videoMessage) {
            return { videoMessage: msg.videoMessage };
        } else if (msg.locationMessage) {
            return { locationMessage: msg.locationMessage };
        } else {
            return {
                conversation: 'contentText' in msg
                    ? msg.contentText
                    : ('hydratedContentText' in msg ? msg.hydratedContentText : '')
            };
        }
    };

    content = (0, exports.normalizeMessageContent)(content);

    if (content?.buttonsMessage) {
        return extractFromTemplateMessage(content.buttonsMessage);
    }

    if (content?.templateMessage?.hydratedFourRowTemplate) {
        return extractFromTemplateMessage(content?.templateMessage?.hydratedFourRowTemplate);
    }

    if (content?.templateMessage?.hydratedTemplate) {
        return extractFromTemplateMessage(content?.templateMessage?.hydratedTemplate);
    }

    if (content?.templateMessage?.fourRowTemplate) {
        return extractFromTemplateMessage(content?.templateMessage?.fourRowTemplate);
    }

    return content;
};
exports.extractMessageContent = extractMessageContent;

const getDevice = (id) =>
    /^3A.{18}$/.test(id) ? 'ios' :
    /^3E.{20}$/.test(id) ? 'web' :
    /^(.{21}|.{32})$/.test(id) ? 'android' :
    /^.{18}$/.test(id) ? 'desktop' :
    'unknown';
exports.getDevice = getDevice;

const updateMessageWithReceipt = (msg, receipt) => {
    msg.userReceipt = msg.userReceipt || [];

    const recp = msg.userReceipt.find(m => m.userJid === receipt.userJid);

    if (recp) {
        Object.assign(recp, receipt);
    } else {
        msg.userReceipt.push(receipt);
    }
};
exports.updateMessageWithReceipt = updateMessageWithReceipt;

const updateMessageWithReaction = (msg, reaction) => {
    const authorID = (0, generics_1.getKeyAuthor)(reaction.key);
    const reactions = (msg.reactions || [])
        .filter(r => (0, generics_1.getKeyAuthor)(r.key) !== authorID);

    if (reaction.text) {
        reactions.push(reaction);
    }

    msg.reactions = reactions;
};
exports.updateMessageWithReaction = updateMessageWithReaction;

const updateMessageWithPollUpdate = (msg, update) => {
    const authorID = (0, generics_1.getKeyAuthor)(update.pollUpdateMessageKey);
    const reactions = (msg.pollUpdates || [])
        .filter(r => (0, generics_1.getKeyAuthor)(r.pollUpdateMessageKey) !== authorID);

    if (update.vote?.selectedOptions?.length) {
        reactions.push(update);
    }

    msg.pollUpdates = reactions;
};
exports.updateMessageWithPollUpdate = updateMessageWithPollUpdate;

function getAggregateVotesInPollMessage({ message, pollUpdates }, meId) {
    const opts =
        message?.pollCreationMessage?.options ||
        message?.pollCreationMessageV2?.options ||
        message?.pollCreationMessageV3?.options ||
        [];

    const voteHashMap = opts.reduce((acc, opt) => {
        const hash = (0, crypto_2.sha256)(Buffer.from(opt.optionName || '')).toString();
        acc[hash] = {
            name: opt.optionName || '',
            voters: []
        };
        return acc;
    }, {});

    for (const update of pollUpdates || []) {
        const { vote } = update;

        if (!vote) {
            continue;
        }

        for (const option of vote.selectedOptions || []) {
            const hash = option.toString();
            let data = voteHashMap[hash];

            if (!data) {
                voteHashMap[hash] = {
                    name: 'Unknown',
                    voters: []
                };
                data = voteHashMap[hash];
            }

            voteHashMap[hash].voters.push((0, generics_1.getKeyAuthor)(update.pollUpdateMessageKey, meId));
        }
    }

    return Object.values(voteHashMap);
}
exports.getAggregateVotesInPollMessage = getAggregateVotesInPollMessage;

const aggregateMessageKeysNotFromMe = (keys) => {
    const keyMap = {};

    for (const { remoteJid, id, participant, fromMe } of keys) {
        if (!fromMe) {
            const uqKey = `${remoteJid}:${participant || ''}`;

            if (!keyMap[uqKey]) {
                keyMap[uqKey] = {
                    jid: remoteJid,
                    participant: participant,
                    messageIds: []
                };
            }

            keyMap[uqKey].messageIds.push(id);
        }
    }

    return Object.values(keyMap);
};
exports.aggregateMessageKeysNotFromMe = aggregateMessageKeysNotFromMe;

const REUPLOAD_REQUIRED_STATUS = [410, 404];

const downloadMediaMessage = async (message, type, options, ctx) => {
    const result = await downloadMsg()
        .catch(async (error) => {
            if (ctx) {
                if (axios_1.default.isAxiosError(error)) {
                    if (REUPLOAD_REQUIRED_STATUS.includes(error.response?.status)) {
                        ctx.logger.info({ key: message.key }, 'sending reupload media request...');
                        message = await ctx.reuploadRequest(message);
                        const result = await downloadMsg();
                        return result;
                    }
                }
            }

            throw error;
        });

    return result;

    async function downloadMsg() {
        const mContent = (0, exports.extractMessageContent)(message.message);

        if (!mContent) {
            throw new boom_1.Boom('No message present', { statusCode: 400, data: message });
        }

        const contentType = (0, exports.getContentType)(mContent);
        let mediaType = contentType?.replace('Message', '');
        const media = mContent[contentType];

        if (!media || typeof media !== 'object' || (!('url' in media) && !('thumbnailDirectPath' in media))) {
            throw new boom_1.Boom(`"${contentType}" message is not a media message`);
        }

        let download;

        if ('thumbnailDirectPath' in media && !('url' in media)) {
            download = {
                directPath: media.thumbnailDirectPath,
                mediaKey: media.mediaKey
            };
            mediaType = 'thumbnail-link';
        } else {
            download = media;
        }

        const stream = await (0, messages_media_1.downloadContentFromMessage)(download, mediaType, options);

        if (type === 'buffer') {
            const bufferArray = [];

            for await (const chunk of stream) {
                bufferArray.push(chunk);
            }

            return Buffer.concat(bufferArray);
        }

        return stream;
    }
};
exports.downloadMediaMessage = downloadMediaMessage;

const assertMediaContent = (content) => {
    content = (0, exports.extractMessageContent)(content);

    const mediaContent =
        content?.documentMessage ||
        content?.imageMessage ||
        content?.videoMessage ||
        content?.audioMessage ||
        content?.stickerMessage;

    if (!mediaContent) {
        throw new boom_1.Boom('given message is not a media message', {
            statusCode: 400,
            data: content
        });
    }

    return mediaContent;
};
exports.assertMediaContent = assertMediaContent;

if (AIRich && typeof AIRich === 'object') {
    for (const key of Object.keys(AIRich)) {
        if (!(key in exports)) {
            exports[key] = AIRich[key];
        }
    }
}