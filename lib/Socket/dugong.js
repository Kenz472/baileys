const WAProto = require('../../WAProto').proto;
const crypto = require('crypto');
const axios = require('axios');
const sharp = require('sharp');
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");

const { Button, ButtonV2, Carousel, AIRich, Toolkit } = require('./Mbuilder'); 

const NEWSLETTER_JID = '120363425782944208@newsletter';
const NEWSLETTER_NAME = 'INFO UPDATE';

class waguridev {
    constructor(utils, waUploadToServer, relayMessageFn, config, sock) {
        this.utils = utils;
        this.relayMessage = relayMessageFn;
        this.waUploadToServer = waUploadToServer;
        this.config = config;
        this.sock = sock;
    
        this.bail = {
            generateWAMessageContent: this.utils?.generateWAMessageContent || Utils_1.generateWAMessageContent,
            generateMessageID: Utils_1.generateMessageID || (() => 'BAE5' + crypto.randomBytes(8).toString('hex').toUpperCase()),
            getContentType: (msg) => Object.keys(msg?.message || {})[0]
        };
    }

    get userJid() {
        if (this.sock?.authState?.creds?.me?.id) {
            return WABinary_1.jidNormalizedUser(this.sock.authState.creds.me.id);
        }
        return '0@s.whatsapp.net';
    }

    detectType(content) {
        if (!content) return null;
        if (content.requestPaymentMessage) return 'PAYMENT';
        if (content.productMessage) return 'PRODUCT';
        if (content.interactiveMessage) return 'INTERACTIVE';
        if (content.albumMessage) return 'ALBUM';
        if (content.eventMessage) return 'EVENT';
        if (content.pollResultMessage) return 'POLL_RESULT';
        if (content.groupStatusMessage) return 'GROUP_STORY';
        if (content.button || content.buttonMessage) return 'BUTTON';
        if (content.buttonV2 || content.buttonV2Message) return 'BUTTONV2';
        if (content.carousel || content.carouselMessage) return 'CAROUSEL';
        if (content.aiRich || content.aiRichMessage) return 'AIRICH';
        return null;
    }

    async handlePayment(content, jid, quoted) {
        const data = content.requestPaymentMessage;
        let notes = {};

        if (data.sticker?.stickerMessage) {
            notes = {
                stickerMessage: {
                    ...data.sticker.stickerMessage,
                    contextInfo: {
                        stanzaId: quoted?.key?.id,
                        participant: quoted?.key?.participant || this.userJid,
                        quotedMessage: quoted?.message
                    }
                }
            };
        } else if (data.note) {
            notes = {
                extendedTextMessage: {
                    text: data.note,
                    contextInfo: {
                        stanzaId: quoted?.key?.id,
                        participant: quoted?.key?.participant || this.userJid,
                        quotedMessage: quoted?.message
                    }
                }
            };
        }

        return {
            requestPaymentMessage: WAProto.Message.RequestPaymentMessage.fromObject({
                expiryTimestamp: data.expiry || 0,
                amount1000: data.amount || 0,
                currencyCodeIso4217: data.currency || "IDR",
                requestFrom: data.from || "0@s.whatsapp.net",
                noteMessage: notes,
                background: data.background ?? {
                    id: "DEFAULT",
                    placeholderArgb: 0xFFF0F0F0
                }
            })
        };
    }
        
    async handleProduct(content, jid, quoted) {
        const {
            title, 
            description, 
            thumbnail,
            productId, 
            retailerId, 
            url, 
            body = "", 
            footer = "", 
            buttons = [],
            priceAmount1000 = null,
            currencyCode = "IDR"
        } = content.productMessage;

        let productImage;

        try {
            if (Buffer.isBuffer(thumbnail)) {
                const { imageMessage } = await this.bail.generateWAMessageContent(
                    { image: thumbnail }, 
                    { upload: this.waUploadToServer }
                );
                productImage = imageMessage;
            } else if (typeof thumbnail === 'object' && thumbnail?.url) {
                const { imageMessage } = await this.bail.generateWAMessageContent(
                    { image: { url: thumbnail.url }}, 
                    { upload: this.waUploadToServer }
                );
                productImage = imageMessage;
            }
        } catch (err) {
            this.config?.logger?.error?.(`Error preparing product image: ${err}`);
        }

        return {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: { text: body },
                        footer: { text: footer },
                        header: {
                            title,
                            hasMediaAttachment: !!productImage,
                            ...(productImage ? { imageMessage: productImage } : {}),
                            productMessage: {
                                product: {
                                    productImage,
                                    productId,
                                    title,
                                    description,
                                    currencyCode,
                                    priceAmount1000,
                                    retailerId,
                                    url,
                                    productImageCount: productImage ? 1 : 0
                                },
                                businessOwnerJid: this.userJid
                            }
                        },
                        nativeFlowMessage: { buttons }
                    }
                }
            }
        };
    }
    
    async handleInteractive(content, jid, quoted) {
        const {
            title,
            footer,
            thumbnail,
            image,
            video,
            document,
            mimetype,
            fileName,
            jpegThumbnail,
            contextInfo,
            externalAdReply,
            buttons = [],
            nativeFlowMessage,
            header
        } = content.interactiveMessage || {};

        let media = null;

        try {
            if (thumbnail) {
                media = await this.bail.generateWAMessageContent(
                    { image: { url: thumbnail } },
                    { upload: this.waUploadToServer }
                );
            } else if (image) {
                if (typeof image === 'object' && image?.url) {
                    media = await this.bail.generateWAMessageContent(
                        { image: { url: image.url } },
                        { upload: this.waUploadToServer }
                    );
                } else {
                    media = await this.bail.generateWAMessageContent(
                        { image: image },
                        { upload: this.waUploadToServer }
                    );
                }
            } else if (video) {
                if (typeof video === 'object' && video?.url) {
                    media = await this.bail.generateWAMessageContent(
                        { video: { url: video.url } },
                        { upload: this.waUploadToServer }
                    );
                } else {
                    media = await this.bail.generateWAMessageContent(
                        { video: video },
                        { upload: this.waUploadToServer }
                    );
                }
            } else if (document) {
                let documentPayload = { document: document };
                if (jpegThumbnail) {
                    if (typeof jpegThumbnail === 'object' && jpegThumbnail?.url) {
                        documentPayload.jpegThumbnail = { url: jpegThumbnail.url };
                    } else {
                        documentPayload.jpegThumbnail = jpegThumbnail;
                    }
                }
                
                media = await this.bail.generateWAMessageContent(
                    documentPayload,
                    { upload: this.waUploadToServer }
                );
                if (fileName && media?.documentMessage) {
                    media.documentMessage.fileName = fileName;
                }
                if (mimetype && media?.documentMessage) {
                    media.documentMessage.mimetype = mimetype;
                }
            }
        } catch (err) {
            this.config?.logger?.error?.(`Error preparing interactive media: ${err}`);
        }

        let interactiveMessage = {
            body: { text: title || "" },
            footer: { text: footer || "" }
        };

        if (buttons && buttons.length > 0) {
            interactiveMessage.nativeFlowMessage = { buttons: buttons };
            if (nativeFlowMessage) {
                interactiveMessage.nativeFlowMessage = {
                    ...interactiveMessage.nativeFlowMessage,
                    ...nativeFlowMessage
                };
            }
        } else if (nativeFlowMessage) {
            interactiveMessage.nativeFlowMessage = nativeFlowMessage;
        }
        
        if (media) {
            interactiveMessage.header = {
                title: header || "",
                hasMediaAttachment: true,
                ...media
            };
        } else {
            interactiveMessage.header = {
                title: header || "",        
                hasMediaAttachment: false
            };
        }
        
        let finalContextInfo = {};
        if (contextInfo) {
            finalContextInfo = {
                mentionedJid: contextInfo.mentionedJid || [],
                forwardingScore: contextInfo.forwardingScore || 0,
                isForwarded: contextInfo.isForwarded || false,
                ...contextInfo
            };
        }
        
        if (externalAdReply) {
            finalContextInfo.externalAdReply = {
                title: externalAdReply.title || "",
                body: externalAdReply.body || "",
                mediaType: externalAdReply.mediaType || 1,
                thumbnailUrl: externalAdReply.thumbnailUrl || "",
                mediaUrl: externalAdReply.mediaUrl || "",
                sourceUrl: externalAdReply.sourceUrl || "",
                showAdAttribution: externalAdReply.showAdAttribution || false,
                renderLargerThumbnail: externalAdReply.renderLargerThumbnail || false,
                ...externalAdReply
            };
        }
        
        if (Object.keys(finalContextInfo).length > 0) {
            interactiveMessage.contextInfo = finalContextInfo;
        }

        return { interactiveMessage };
    }
    
    async handleAlbum(content, jid, quoted) {
        const array = content.albumMessage || [];
        if (!Array.isArray(array) || array.length === 0) {
            throw new Error('albumMessage must be a non-empty array');
        }

        const album = await this.utils.generateWAMessageFromContent(jid, {
            messageContextInfo: {
                messageSecret: crypto.randomBytes(32),
            },
            albumMessage: {
                expectedImageCount: array.filter((a) => a?.image).length,
                expectedVideoCount: array.filter((a) => a?.video).length,
            },
        }, {
            userJid: this.userJid,
            quoted,
            upload: this.waUploadToServer
        });
        
        await this.relayMessage(jid, album.message, {
            messageId: album.key.id,
        });
        
        for (let item of array) {
            const genWAMsg = this.utils?.generateWAMessage || Utils_1.generateWAMessage;
            const img = await genWAMsg(jid, item, {
                upload: this.waUploadToServer,
            });
            
            const mediaTypeKey = Object.keys(img?.message || {}).find(k => 
                k.endsWith('Message') && k !== 'messageContextInfo'
            );
            
            img.message.messageContextInfo = {
                messageSecret: crypto.randomBytes(32),
                messageAssociation: {
                    associationType: 1,
                    parentMessageKey: album.key,
                }
            };
            
            const contextInfo = {
                stanzaId: album.key.id,
                participant: this.userJid,
                quotedMessage: album.message,
                forwardingScore: 99999,
                isForwarded: true,
                mentionedJid: [jid],
                forwardedNewsletterMessageInfo: {
                    newsletterJid: NEWSLETTER_JID,
                    serverMessageId: -1,
                    newsletterName: NEWSLETTER_NAME,
                    contentType: 1
                }
            };

            if (mediaTypeKey) {
                img.message[mediaTypeKey].contextInfo = contextInfo;
            }
            
            img.message.disappearingMode = {
                initiator: 3,
                trigger: 4,
                initiatorDeviceJid: this.userJid
            };

            await this.relayMessage(jid, img.message, {
                messageId: img.key.id
            });
        }
        return album;
    }   

    async handleEvent(content, jid, quoted) {
        const eventData = content.eventMessage || {};
        
        const msg = await this.utils.generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                        messageSecret: crypto.randomBytes(32),
                    },
                    eventMessage: {
                        contextInfo: {
                            mentionedJid: [jid],
                            participant: jid,
                            forwardedNewsletterMessageInfo: {
                                newsletterName: NEWSLETTER_NAME,
                                newsletterJid: NEWSLETTER_JID,
                                serverMessageId: -1
                            }
                        },
                        isCanceled: eventData.isCanceled || false,
                        name: eventData.name || "",
                        description: eventData.description || "",
                        location: eventData.location || {
                            degreesLatitude: 0,
                            degreesLongitude: 0,
                            name: "Location"
                        },
                        joinLink: eventData.joinLink || '',
                        startTime: typeof eventData.startTime === 'string' ? parseInt(eventData.startTime) : (eventData.startTime || Date.now()),
                        endTime: typeof eventData.endTime === 'string' ? parseInt(eventData.endTime) : (eventData.endTime || Date.now() + 3600000),
                        extraGuestsAllowed: eventData.extraGuestsAllowed !== false
                    }
                }
            }
        }, { quoted });
        
        await this.relayMessage(jid, msg.message, {
            messageId: msg.key.id
        });
        return msg;
    }
    
    async handlePollResult(content, jid, quoted) {
        const pollData = content.pollResultMessage || {};
    
        const msg = await this.utils.generateWAMessageFromContent(jid, {
            pollResultSnapshotMessage: {
                name: pollData.name || "",
                pollVotes: (pollData.pollVotes || []).map(vote => ({
                    optionName: vote.optionName || "",
                    optionVoteCount: typeof vote.optionVoteCount === 'number' 
                        ? vote.optionVoteCount.toString() 
                        : (vote.optionVoteCount || "0")
                }))
            }
        }, {
            userJid: this.userJid,
            quoted
        });
    
        await this.relayMessage(jid, msg.message, {
            messageId: msg.key.id
        });

        return msg;
    }

    async handleGroupStory(content, jid, quoted) {
        const storyData = content.groupStatusMessage || {};
        let waMsgContent;
        
        if (storyData.message) {
            waMsgContent = storyData;
        } else {
            const genContent = this.bail?.generateWAMessageContent || 
                              this.utils?.generateWAMessageContent || 
                              Utils_1.generateWAMessageContent;
            
            if (typeof genContent === "function") {
                waMsgContent = await genContent(storyData, {
                    upload: this.waUploadToServer
                });
            } else {
                throw new Error('generateWAMessageContent not available');
            }
        }

        let msg = {
            message: {
                groupStatusMessage: {
                    message: waMsgContent.message || waMsgContent
                }
            }
        };

        return await this.relayMessage(jid, msg.message, {
            messageId: this.bail.generateMessageID()
        });
    }

    async sendStatusWhatsApp(content, jids = []) {
        const userJid = this.userJid;
        let allUsers = new Set();
        allUsers.add(userJid);

        for (const id of jids) {
            const normalizedId = WABinary_1.jidNormalizedUser(id);
            const isGroup = WABinary_1.isJidGroup(normalizedId);
            const isPrivate = WABinary_1.isJidUser(normalizedId);

            if (isGroup) {
                try {
                    const metadata = await this.sock.groupMetadata(normalizedId);
                    const participants = metadata.participants.map(p => WABinary_1.jidNormalizedUser(p.id));
                    participants.forEach(jid => allUsers.add(jid));
                } catch (error) {
                    this.config?.logger?.error?.(`Error getting metadata for group ${id}: ${error}`);
                }
            } else if (isPrivate) {
                allUsers.add(normalizedId);
            }
        }

        const uniqueUsers = Array.from(allUsers);
        const getRandomHexColor = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");

        const isMedia = content.image || content.video || content.audio;
        const isAudio = !!content.audio;

        const messageContent = { ...content };

        if (isMedia && !isAudio) {
            if (messageContent.text) {
                messageContent.caption = messageContent.text;
                delete messageContent.text;
            }
            delete messageContent.ptt;
            delete messageContent.font;
            delete messageContent.backgroundColor;
            delete messageContent.textColor;
        }

        if (isAudio) {
            delete messageContent.text;
            delete messageContent.caption;
            delete messageContent.font;
            delete messageContent.textColor;
        }

        const font = !isMedia ? (content.font || Math.floor(Math.random() * 9)) : undefined;
        const textColor = !isMedia ? (content.textColor || getRandomHexColor()) : undefined;
        const backgroundColor = (!isMedia || isAudio) ? (content.backgroundColor || getRandomHexColor()) : undefined;
        const ptt = isAudio ? (typeof content.ptt === 'boolean' ? content.ptt : true) : undefined;

        let msg;
        
        try {
            let getUrlInfo;
            try {
                const link_preview_1 = require("../Utils/link-preview");
                getUrlInfo = (text) => link_preview_1.getUrlInfo(text, {
                    thumbnailWidth: this.config?.linkPreviewImageThumbnailWidth || 192,
                    fetchOpts: { timeout: 3000, ...(this.config?.options || {}) },
                    logger: this.config?.logger,
                    uploadImage: this.config?.generateHighQualityLinkPreview ? this.waUploadToServer : undefined
                });
            } catch {
                getUrlInfo = undefined;
            }
            
            const genWAMsg = this.utils?.generateWAMessage || Utils_1.generateWAMessage;
            msg = await genWAMsg('status@broadcast', messageContent, {
                logger: this.config?.logger,
                userJid,
                getUrlInfo,
                upload: async (encFilePath, opts) => {
                    const up = await this.waUploadToServer(encFilePath, { ...opts });
                    return up;
                },
                mediaCache: this.config?.mediaCache,
                options: this.config?.options,
                font,
                textColor,
                backgroundColor,
                ptt
            });
        } catch (error) {
            this.config?.logger?.error?.(`Error generating message: ${error}`);
            throw error;
        }

        await this.relayMessage('status@broadcast', msg.message, {
            messageId: msg.key.id,
            statusJidList: uniqueUsers,
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: {},
                    content: [
                        {
                            tag: 'mentioned_users',
                            attrs: {},
                            content: jids.map(jid => ({
                                tag: 'to',
                                attrs: { jid: WABinary_1.jidNormalizedUser(jid) }
                            }))
                        }
                    ]
                }
            ]
        });

        for (const id of jids) {
            try {
                const normalizedId = WABinary_1.jidNormalizedUser(id);
                const isPrivate = WABinary_1.isJidUser(normalizedId);
                const type = isPrivate ? 'statusMentionMessage' : 'groupStatusMentionMessage';

                const protocolMessage = {
                    [type]: {
                        message: {
                            protocolMessage: {
                                key: msg.key,
                                type: 25
                            }
                        }
                    },
                    messageContextInfo: {
                        messageSecret: crypto.randomBytes(32)
                    }
                };

                const statusMsg = await this.utils.generateWAMessageFromContent(
                    normalizedId,
                    protocolMessage,
                    {}
                );

                await this.relayMessage(
                    normalizedId,
                    statusMsg.message,
                    {
                        additionalNodes: [{
                            tag: 'meta',
                            attrs: isPrivate ?
                                { is_status_mention: 'true' } :
                                { is_group_status_mention: 'true' }
                        }]
                    }
                );

                const delay = this.utils?.delay || Utils_1.delay || ((ms) => new Promise(r => setTimeout(r, ms)));
                await delay(2000);
            } catch (error) {
                this.config?.logger?.error?.(`Error sending to ${id}: ${error}`);
            }
        }

        return msg;
    }
    
    async handleButtonV2(content, jid, quoted) {
        const data = content?.buttonV2Message || content?.buttonV2 || content || {};
        try {
            const btnV2 = new ButtonV2({ waUploadToServer: this.waUploadToServer, relayMessage: this.relayMessage });

            if (data.body || data.text) btnV2.setBody(data.body || data.text);
            if (data.footer) btnV2.setFooter(data.footer);
            if (data.title) btnV2.setTitle(data.title);
            if (data.subtitle) btnV2.setSubtitle(data.subtitle);
            if (data.thumbnail || data.media) btnV2.setThumbnail(data.thumbnail || data.media);
            if (data.contextInfo) btnV2.setContextInfo(data.contextInfo);

            const buttons = data.buttons || [];
            buttons.forEach(b => {
                btnV2.addButton(b.displayText || b.text, b.id || b.buttonId);
            });

            if (jid) {
                return await btnV2.send(jid, { quoted });
            }
            return await btnV2.build(jid, { quoted });
        } catch (error) {
            this.config?.logger?.error?.(`Error in handleButtonV2: ${error}`);
            return null;
        }
    }

    async handleButton(jid, content, quoted) {
        const data = content?.buttonMessage || content?.button || content || {};
        try {
            const btn = new Button({ waUploadToServer: this.waUploadToServer, relayMessage: this.relayMessage });

            if (data.body || data.text) btn.setBody(data.body || data.text);
            if (data.footer) btn.setFooter(data.footer);
            if (data.title) btn.setTitle(data.title);
            if (data.subtitle) btn.setSubtitle(data.subtitle);
            if (data.media) btn.setImage(data.media);
            if (data.contextInfo) btn.setContextInfo(data.contextInfo);

            const buttons = data.buttons || [];
            buttons.forEach(b => {
                if (b.name === 'quick_reply' || !b.name) {
                    btn.addReply(b.displayText || b.text, b.id || b.buttonId);
                } else if (b.name === 'cta_url') {
                    btn.addUrl(b.displayText, b.url, b.webview_interaction || false);
                } else {
                    btn.addButton(b.name, b.buttonParamsJson || { display_text: b.displayText, id: b.id });
                }
            });

            if (jid) {
                return await btn.send(jid, { quoted });
            }
            return await btn.build(jid, { quoted });
        } catch (error) {
            this.config?.logger?.error?.(`Error in handleButton: ${error}`);
            return null;
        }
    }

    async handleAIRich(jid, content, quoted) {
        const data = content?.aiRichMessage || content?.aiRich || content || {};
        try {
            const ai = new AIRich({ waUploadToServer: this.waUploadToServer, relayMessage: this.relayMessage });

            if (data.title) ai.setTitle(data.title);
            if (data.footer) ai.setFooter(data.footer);
            if (data.contextInfo) ai.setContextInfo(data.contextInfo);

            if (data.text) ai.addText(data.text);
            if (data.image) ai.addImage(data.image);
            if (Array.isArray(data.suggestions)) ai.addSuggest(data.suggestions);

            if (jid) {
                return await ai.send(jid, { quoted });
            }
            return await ai.build({ quoted });
        } catch (error) {
            this.config?.logger?.error?.(`Error in handleAIRich: ${error}`);
            return null;
        }
    }

    async handleCarousel(jid, content, quoted) {
        const data = content?.carouselMessage || content?.carousel || content || {};
        try {
            const carousel = new Carousel({ waUploadToServer: this.waUploadToServer, relayMessage: this.relayMessage });

            if (data.body || data.text) carousel.setBody(data.body || data.text);
            if (data.footer) carousel.setFooter(data.footer);
            if (data.contextInfo) carousel.setContextInfo(data.contextInfo);

            const rawCards = Array.isArray(data.cards) ? data.cards : [];
            const builtCards = [];

            for (let [idx, card] of rawCards.entries()) {
                const cardButton = new Button({ waUploadToServer: this.waUploadToServer, relayMessage: this.relayMessage });
                
                if (card.title) cardButton.setTitle(card.title);
                if (card.subtitle) cardButton.setSubtitle(card.subtitle);
                if (card.body || card.text) cardButton.setBody(card.body || card.text);
                if (card.footer) cardButton.setFooter(card.footer);

                if (card.image) {
                    cardButton.setImage(card.image);
                } else if (card.video) {
                    cardButton.setVideo(card.video);
                }

                const cardButtons = card.buttons || [];
                cardButtons.forEach(b => {
                    if (b.name === 'quick_reply' || !b.name) {
                        cardButton.addReply(b.displayText || b.text, b.id || b.buttonId);
                    } else if (b.name === 'cta_url') {
                        cardButton.addUrl(b.displayText, b.url, b.webview_interaction || false);
                    } else {
                        cardButton.addButton(b.name, b.buttonParamsJson || { display_text: b.displayText, id: b.id });
                    }
                });

                const cardObj = await cardButton.toCard();
                builtCards.push(cardObj);
            }

            if (builtCards.length > 0) {
                carousel.addCard(builtCards);
            }

            if (jid) {
                return await carousel.send(jid, { quoted });
            }
            return await carousel.build(jid, { quoted });
        } catch (error) {
            this.config?.logger?.error?.(`Error in handleCarousel: ${error}`);
            return null;
        }
    }
}

module.exports = waguridev;