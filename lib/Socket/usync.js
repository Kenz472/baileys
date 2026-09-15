"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeUSyncSocket = void 0;
const boom_1 = require("@hapi/boom");
const WABinary_1 = require("../WABinary");
const socket_1 = require("./socket");

const makeUSyncSocket = (config) => {
    const sock = (0, socket_1.makeSocket)(config);
    const { generateMessageTag, query } = sock;

    const executeUSyncQuery = async (usyncQuery) => {
        if (!usyncQuery) {
            throw new boom_1.Boom('USyncQuery is required');
        }

        const protocols = usyncQuery.protocols || [];
        const validUsers = usyncQuery.users || [];

        if (protocols.length === 0) {
            throw new boom_1.Boom('USyncQuery must have at least one protocol');
        }

        if (validUsers.length === 0) {
            throw new boom_1.Boom('USyncQuery must have at least one user');
        }

        const userNodes = validUsers.map((user) => {
            return {
                tag: 'user',
                attrs: {
                    jid: !user.phone ? user.id : undefined,
                },
                content: protocols
                    .map((a) => a.getUserElement(user))
                    .filter((a) => a !== null && a !== undefined)
            };
        });

        const listNode = {
            tag: 'list',
            attrs: {},
            content: userNodes
        };

        const queryNode = {
            tag: 'query',
            attrs: {},
            content: protocols
                .map((a) => a.getQueryElement())
                .filter((a) => a !== null && a !== undefined)
        };

        const iq = {
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'get',
                xmlns: 'usync',
            },
            content: [
                {
                    tag: 'usync',
                    attrs: {
                        context: usyncQuery.context,
                        mode: usyncQuery.mode,
                        sid: generateMessageTag(),
                        last: 'true',
                        index: '0',
                    },
                    content: [
                        queryNode,
                        listNode
                    ]
                }
            ],
        };

        const result = await query(iq);

        if (typeof usyncQuery.parseUSyncQueryResult !== 'function') {
            throw new boom_1.Boom('USyncQuery.parseUSyncQueryResult is not a function');
        }

        return usyncQuery.parseUSyncQueryResult(result);
    };

    return {
        ...sock,
        executeUSyncQuery,
    };
};

exports.makeUSyncSocket = makeUSyncSocket;


/********* [ Information Author ] *********/

//• Author: Kenz • coding
//• Date: 01-03-2026
//• Time: 04:48 Wib

/********* [ ********************** ] *********/