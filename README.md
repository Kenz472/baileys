# 🚀 Baileys @Eula/baileys

<div align="center">

![WhatsApp API Banner](https://cdn.zass.in/ijNrrYwP0E.jpeg)

*A powerful WebSockets-based TypeScript library for interacting with the WhatsApp Web API*

[![☏ Chennall](https://img.shields.io/badge/WhatsApp-Join-green?logo=whatsapp)](https://chat.whatsapp.com/HlyYOczlYcn9JipRVchJxE) 

[![Subscribe YouTube](https://img.shields.io/badge/Subscribe-YouTube-red?logo=youtube)](https://www.youtube.com/@Ken_botz_pemula)

[![Join Telegram](https://img.shields.io/badge/Join-Telegram-blue?logo=telegram)](https://t.me/@Kenz_472)

[![Follow Instagram](https://img.shields.io/badge/Follow-Instagram-critical?logo=instagram)](https://www.instagram.com/kenz.offc?igsh=MWk3eXVsaHN1OXU0cQ==)

</div>

### 📦 Installation

<div align="center">

```bash
# 📦 Install via npm
npm install @waguri/baileys

# Atau install dari GitHub
npm install github:Kenz472/Baileys
```

</div>

### 🔌 Basic Usage

```javascript
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@waguri/baileys");
const { Boom } = require("@hapi/boom");

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("Connection closed, reconnecting...", shouldReconnect);

            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === "open") {
            console.log("✅ Connected to WhatsApp!");
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        console.log("📩 New message:", JSON.stringify(m, undefined, 2));

        // Echo received messages
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.message) {
            await sock.sendMessage(msg.key.remoteJid, { text: "Hello! 👋" });
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

connectToWhatsApp();
```

---

## 🔌 Connecting Account

### 📱 Starting socket with **QR-CODE**

<div align="center">

> [!TIP]
> **Pro Tip:** Customize browser name using the `Browsers` constant.

</div>

```javascript
const { default: makeWASocket, Browsers } = require("@waguri/baileys");

const sock = makeWASocket({
    browser: Browsers.ubuntu("My App"),
    printQRInTerminal: true
});
```

### 🔢 Starting socket with **Pairing Code**

<div align="center">

> [!IMPORTANT]
> **Pairing Code connects WhatsApp Web without QR-CODE.**  
> Phone number format: country code + number (no +, (), or -)

</div>

```javascript
const { default: makeWASocket, useMultiFileAuthState } = require("@waguri/baileys");

async function startWithPairing() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Must be false for pairing code
    });

    // Standard pairing
    if (!sock.authState.creds.registered) {
        const number = "6281234567890"; // Your phone number
        const code = await sock.requestPairingCode(number);
        console.log("🔑 Pairing Code:", code);
    }

    // Custom pairing (8 digits/letters)
    if (!sock.authState.creds.registered) {
        const customPair = "12345678";
        const number = "6281234567890";
        const code = await sock.requestPairingCode(number, customPair);
        console.log("🔑 Custom Pairing Code:", code);
    }

    sock.ev.on("creds.update", saveCreds);
}

startWithPairing();
```

---

## 💾 Saving & Restoring Sessions

<div align="center">

**🎯 Never scan QR codes again! Save your session:**

</div>

```javascript
const { useMultiFileAuthState } = require("@waguri/baileys");

async function setupSession() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on("creds.update", saveCreds);
    return sock;
}
```

---

## 💬 Message Types

### 📝 Text Message
```javascript
await sock.sendMessage(jid, { text: "Hello World! 🌍" });
```

### 𖠋 Button Message (Legacy)
```javascript
await sock.sendMessage(jid, {
    text: "simple Baileys",
    footer: "Baileys: @waguri/baileys",
    buttons: [
        {
            buttonId: "btn1",
            buttonText: { displayText: "✅ Option 1" },
            type: 1
        },
        {
            buttonId: "btn2",
            buttonText: { displayText: "❌ Option 2" },
            type: 1
        }
    ],
    headerType: 1
});
```

### 🎯 Interactive Message with Flow
```javascript
await sock.sendMessage(jid, {
    text: "simple Baileys",
    footer: "Baileys: @waguri/baileys",
    buttons: [
        {
            buttonId: "menu",
            buttonText: { displayText: "📋 Show Menu" },
            type: 4,
            nativeFlowInfo: {
                name: "single_select",
                paramsJson: JSON.stringify({
                    title: "Select Option",
                    sections: [{
                        title: "Available Options",
                        highlight_label: "⭐",
                        rows: [
                            {
                                header: "OPTION 1",
                                title: "First Choice",
                                description: "Description for option 1",
                                id: "opt1"
                            },
                            {
                                header: "OPTION 2", 
                                title: "Second Choice",
                                description: "Description for option 2",
                                id: "opt2"
                            }
                        ]
                    }]
                })
            }
        }
    ]
});
```

### 📸 Album Message
```javascript
const fs = require("fs");

await sock.sendMessage(jid, { 
    albumMessage: [
        { image: fs.readFileSync("./image1.jpg"), caption: "Foto pertama" },
        { image: { url: "https://example.com/image.jpg" }, caption: "Foto kedua" }
    ] 
}, { quoted: m });
```

### #️⃣ Status Mentions Message
```javascript
await sock.sendStatusMentions({
    image: {
        url: "https://example.com/image.jpg"
    }, 
    caption: "Nice day!"
}, ["123@s.whatsapp.net", "456@s.whatsapp.net"]);
```

### 🎊 Status Sw Groups
```javascript
const fs = require("fs");

sock.sendMessage(idgc, {
    groupStatusMessage: {
        image: fs.readFileSync("./status.jpg"),
        caption: "Status grup!"
    }
}, { quoted: m });
```

### 🛍️ Product Message
```javascript
const fs = require("fs");

await sock.sendMessage(jid, {
    product: {
        productId: "123",
        title: "Cool T-Shirt",
        description: "100% cotton",
        price: 1999, // In cents (e.g., $19.99)
        currencyCode: "USD",
        productImage: fs.readFileSync("thumbnail.jpg")
    }
});
```

### 👤 Contact Message
```javascript
const nameown = "Owner Name";
const nomorown = "6281234567890";
const syt = "https://example.com";

let vcard = "BEGIN:VCARD\n" +
"VERSION:3.0\n" +
"N:WhatsApp;Owner Name;Bot;;Md\n" +
"FN:" + nameown + "\n" +
"NICKNAME:👑 Owner\n" +
"ORG:Company\n" +
"TITLE:Owner\n" +
"item1.TEL;waid=" + nomorown + ":" + nomorown + "\n" +
"item1.X-ABLabel:📞 Nomor Owner\n" +
"item2.URL:" + syt + "\n" +
"item2.X-ABLabel:💬 More\n" +
"item3.EMAIL;type=INTERNET:email@example.com\n" +
"item3.X-ABLabel:💌 Email\n" +
"item4.ADR:;; 🇮🇩 INDONESIA;;;;\n" +
"item4.X-ABLabel:Lokasi\n" +
"BDAY;value=date:🔖 13 juni 2001\n" +
"END:VCARD";

await sock.sendMessage(jid, { 
    contacts: { 
        displayName: nameown, 
        contacts: [{ vcard }] 
    }
});
```

### 📆 Event Message
```javascript
await sock.sendMessage(jid, { 
    eventMessage: { 
        isCanceled: false, 
        name: "Hello World", 
        description: "Join event ini!", 
        location: { 
            degreesLatitude: -6.2088, 
            degreesLongitude: 106.8456, 
            name: "Jakarta" 
        }, 
        joinLink: "https://call.whatsapp.com/video/example", 
        startTime: "1763019000", 
        endTime: "1763026200", 
        extraGuestsAllowed: false 
    } 
}, { quoted: m });
```

### 🍎 Simple Button Copy
```javascript
await sock.sendMessage(jid, {
    interactiveMessage: {
        header: "Hello World",
        title: "simple Baileys",
        footer: "Baileys: @waguri/baileys",
        buttons: [
            {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: "copy code",
                    id: "123456789",              
                    copy_code: "ABC123XYZ"
                })
            }
        ]
    }
}, { quoted: m });
```

### ✨ Interactive Message with Native Flow
```javascript
await sock.sendMessage(jid, {    
    interactiveMessage: {      
        header: "Hello World",
        title: "simple Baileys",
        footer: "Baileys: @waguri/baileys",
        image: { url: "https://example.com/image.jpg" },
        nativeFlowMessage: {        
            messageParamsJson: JSON.stringify({          
                limited_time_offer: {            
                    text: "Special Offer!",            
                    url: "https://wa.me/62xxx",            
                    copy_code: "Baileys",            
                    expiration_time: Date.now() + 86400000          
                },          
                bottom_sheet: {            
                    in_thread_buttons_limit: 2,            
                    divider_indices: [1, 2, 3, 4, 5],            
                    list_title: "Baileys WhatsApp",            
                    button_title: "Baileys WhatsApp"          
                },          
                tap_target_configuration: {            
                    title: "Shop",            
                    description: "Description here",
                    canonical_url: "https://t.me/example",
                    domain: "shop.example.com",
                    button_index: 0          
                }        
            }),        
            buttons: [          
                {            
                    name: "single_select",            
                    buttonParamsJson: JSON.stringify({
                        has_multiple_buttons: true
                    })
                },
                {
                    name: "call_permission_request",
                    buttonParamsJson: JSON.stringify({
                        has_multiple_buttons: true
                    })
                },          
                {            
                    name: "single_select",            
                    buttonParamsJson: JSON.stringify({
                        title: "Hello World",              
                        sections: [
                            {
                                title: "title",
                                highlight_label: "label",
                                rows: [
                                    {
                                        title: "Option 1",
                                        description: "Description here",
                                        id: "row_1"
                                    }                  
                                ]                
                            }              
                        ],              
                        has_multiple_buttons: true            
                    })          
                },          
                {            
                    name: "cta_copy",            
                    buttonParamsJson: JSON.stringify({              
                        display_text: "copy code",              
                        id: "123456789",              
                        copy_code: "ABC123XYZ"            
                    })          
                }        
            ]      
        }    
    }  
}, { quoted: m });
```

### 🐢 Product Button Message
```javascript
await sock.sendMessage(jid, {
    productMessage: {
        title: "Produk Contoh",
        description: "Ini adalah deskripsi produk",
        thumbnail: { url: "https://example.com/image.jpg" },
        productId: "PROD001",
        retailerId: "RETAIL001",
        url: "https://example.com/product",
        body: "Detail produk",
        footer: "Harga spesial",
        priceAmount1000: 50000,
        currencyCode: "IDR",
        buttons: [
            {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "Beli Sekarang",
                    url: "https://example.com/buy"
                })
            }
        ]
    }
}, { quoted: m });
```

### 📚 Interactive Message with Document Buffer
```javascript
const fs = require("fs");

await sock.sendMessage(jid, {
    interactiveMessage: {
        header: "Hello World",
        title: "Hello World",
        footer: "telegram: @Baileys WhatsApp",
        document: fs.readFileSync("./package.json"),
        mimetype: "application/json",
        fileName: "Baileys_WhatsApp.json",
        jpegThumbnail: fs.readFileSync("./document.jpeg"),
        contextInfo: {
            mentionedJid: [jid],
            forwardingScore: 777,
            isForwarded: false
        },
        externalAdReply: {
            title: "Bot Name",
            body: "Team Name",
            mediaType: 3,
            thumbnailUrl: "https://example.com/image.jpg",
            mediaUrl: "https://example.com",
            sourceUrl: "https://t.me/example",
            showAdAttribution: true,
            renderLargerThumbnail: false         
        },
        buttons: [
            {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "Telegram",
                    url: "https://t.me/example",
                    merchant_url: "https://t.me/example"
                })
            }
        ]
    }
}, { quoted: m });
```

### 📋 Poll Message
```javascript
await sock.sendMessage(jid, {
    poll: {
        name: "What\'s your favorite color? 🎨",
        values: ["🔴 Red", "🔵 Blue", "🟢 Green", "🟡 Yellow"],
        selectableCount: 1
    }
});
```

### 📚 Message Table (Custom Method)
> ⚠️ Method `sendTable` adalah custom method. Pastikan sudah diimplementasikan di project Anda.

```javascript
let data = {
    game: { total: 10, aktif: 5 },
    tools: { total: 20, aktif: 10 },
    info: { total: 5, aktif: 3 }
};

let ICONS = {
    game: "🎮",
    tools: "🔧",
    info: "ℹ️"
};

let sorted = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
let total = Object.values(data).reduce((acc, curr) => acc + curr.total, 0);
let enabled = Object.values(data).reduce((acc, curr) => acc + curr.aktif, 0);

const tableData = sorted.map(([cat, data]) => {
    const pct = ((data.total / total) * 100).toFixed(1);
    return [
        `${ICONS[cat] || "📦"} ${cat.toUpperCase()}`,
        data.total.toString(),
        `${pct}%`
    ];
});

// Pastikan method sendTable sudah tersedia
await sock.sendTable(
    jid,
    "Distribusi Fitur",
    ["Kategori", "Jumlah", "Persen"],
    tableData,
    m,
    {
        headerText: `Total: ${total} | Aktif: ${enabled} | Kategori: ${sorted.length}`,
        footer: `Total ${total} fitur tersedia`
    }
);
```

### 🥀 Button Message Carousel (Cards)
```javascript
await sock.sendMessage(jid,
    {
        text: "📢 Isi Utama Pesan",
        title: "🗂️ Judul Utama",
        subtitle: "📌 Subjudul Opsional",
        footer: "📩 Footer Pesan",
        cards: [
            {
                image: { url: "https://www.example.com/image1.jpg" },
                title: "🖼️ Judul Kartu",
                body: "📝 Isi Konten Kartu",
                footer: "📍 Footer Kartu",
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "💬 Tombol Cepat",
                            id: "ID_TOMBOL_1"
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🔗 Kunjungi Website",
                            url: "https://www.example.com"
                        })
                    }
                ]
            },
            {
                image: { url: "https://www.example.com/image2.jpg" },
                title: "🎥 Judul Kartu Video",
                body: "📝 Deskripsi Konten",
                footer: "📍 Footer Kartu",
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "⚡ Respon Cepat",
                            id: "ID_TOMBOL_2"
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🔎 Lihat Selengkapnya",
                            url: "https://www.example.com"
                        })
                    }
                ]
            }
        ]
    }
);
```

### Button tipe ngambang (Location Button)
```javascript
const fs = require("fs");

await sock.sendMessage(jid, {
    buttonsMessage: {
        contentText: "Pesan utama", 
        footerText: "Powered by Bot",
        headerType: 6,
        locationMessage: {
            degreesLatitude: -6.2088,
            degreesLongitude: 106.8456,
            name: "Lokasi",
            address: "Jakarta",
            jpegThumbnail: fs.readFileSync("./thumb.jpg")
        },
        buttons: [
            {
                buttonId: ".menu",
                buttonText: { displayText: "🍒 Menu" },
                type: 1
            }
        ]
    }
}, { quoted: m });
```

### Button dengan Native Flow (Location)
```javascript
await sock.sendMessage(jid, {
    buttonsMessage: {
        contentText: "Pesan utama", 
        footerText: "Powered by Bot",
        headerType: 6,
        locationMessage: {
            degreesLatitude: -6.2088,
            degreesLongitude: 106.8456,
            name: "Lokasi",
            address: "Jakarta",
            jpegThumbnail: Buffer.alloc(0) // atau fs.readFileSync("./thumb.jpg")
        },
        buttons: [
            {
                buttonText: {
                    displayText: "📡 Menu"
                },
                buttonId: "menu_id",
                type: 1,
                nativeFlowInfo: {
                    name: "single_select",
                    paramsJson: JSON.stringify({
                        title: "Click Here!",
                        sections: [{
                            title: "Menu",
                            highlight_label: "",
                            rows: [{
                                header: "",
                                title: "Menu Utama",
                                description: "Tampilkan menu",
                                id: ".menu"
                            }]
                        }]
                    })
                }
            }
        ]
    }
}, { quoted: m });
```

### sendButtonV2 (Custom Method)
> ⚠️ Method `sendbuttonV2` adalah custom method. Pastikan sudah diimplementasikan.

```javascript
const fs = require("fs");

await sock.sendbuttonV2(jid, {
    title: "Nama Toko / Judul",
    subtitle: "Jl. Merdeka No. 123, Jakarta",
    body: "Halo! Silakan pilih menu di bawah ini:",
    footer: "Klik tombol untuk memilih",
    buttons: [
        { id: "pesan_sekarang", text: "Pesan Sekarang" },
        { id: "cek_status", text: "Cek Status Pesanan" }
    ],
    thumbnail: fs.readFileSync("./thumb.jpg"),
    quoted: m 
});
```

---

### aiRichMessage Management
> ⚠️ Method-method berikut adalah custom extension. Pastikan sudah tersedia di project Anda.

<details>
<summary style="font-weight: bold; cursor: pointer; padding: 8px; border-bottom: 1px solid #eee; margin-bottom: 5px;">Show Examples</summary>
<div style="padding: 10px 15px; background: #f9f9f9; border: 1px solid #eee; border-top: none; border-radius: 0 0 5px 5px;">

```javascript
// Send Table
let title = "⚡ BAILEYS DIGITAL INVOICE";
let headers = ["ID", "USERNAME", "TOTAL"];
let rows = [
    ["01", "roti", "Rp261.736"],
    ["02", "BUDI", "Rp150.000"],
    ["03", "ANI", "Rp98.200"]
];

await sock.sendTable(jid, title, headers, rows, m);
```

```javascript
// Send Table with Options
await sock.sendTable(
    jid,
    "⌬ BAILEYS TECH STACK",
    ["Feature", "Java", "JavaScript"],
    [
        ["Type", "Compiled", "Interpreted"],
        ["Typing", "Static", "Dynamic"],
        ["Main Use", "Enterprise", "Web, Full-stack"],
    ],
    m,
    {
        headerText: "📊 Multi-Device Comparison:",
        footer: "Baileys WebSocket Protocol",
    },
);
```

```javascript
// Send List
await sock.sendList(
    jid,
    "🤖 BAILEYS MAINFRAME",
    [
        ["System", "Baileys MD"],
        ["Version", "5.0.0-Stable"],
        ["Engine", "Node.js Runtime"],
    ],
    m,
    { footer: "Secure Encrypted Connection" },
);
```

```javascript
// Send Code Block
await sock.sendCodeBlock(
    jid,
    `const greeting = "Hello World";
function sayHello(name) {
    return greeting + " " + name;
}
sayHello("Baileys User");`,
    m,
    {
        language: "javascript",
        title: "📜 BAILEYS SOURCE CODE",
        footer: "Executed via Baileys Core",
    },
);
```

```javascript
// Send Table V2
await sock.sendTableV2(
    jid,
    [
        "🌐 BAILEYS NETWORK DATA",
        "Metric | Java | JavaScript",
        "Type | Compiled | Interpreted;;Typing | Static | Dynamic;;Main Use | Enterprise | Web, Full-stack",
    ],
    m,
    {
        headerText: "🛰️ System Analytics:",
        text: "Baileys Multi-Device Report:",
        footer: "Digital Signature Verified",
    },
);
```

```javascript
// Send Code Block V2
await sock.sendCodeBlockV2(
    jid,
    `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
    m,
    {
        language: "go",
        title: "💎 BAILEYS GO-SNIPPET",
        text: "Code structure analysis:",
        footer: "Baileys Developer Mode",
    },
);
```

```javascript
// Send Link
await sock.sendLink(
    jid,
    "📡 BAILEYS DATA TRANSMISSION\n\n✅ Server A: {{IE_0}}🌐 Link Access{{/IE_0}}\n✅ Server B: {{IE_1}}🌐 Link Access{{/IE_1}}",
    ["https://example.com/upload1", "https://example.com/upload2"],
    m,
    {
        headerText: "📁 BAILEYS ASSET MANAGER",
        footer: "Links Verified by Baileys",
        botJid: "867051314767696@bot",
        forwardingScore: 1,
        citations: [
            {
                sourceTitle: "Baileys Cloud",
                citationNumber: 1,
                faviconCdnUrl: "https://cdn.example.com/favicon.ico",
            },
            { sourceTitle: "Data Storage", citationNumber: 2 },
        ],
        proofs: [
            {
                version: 1,
                useCase: 1,
                signature: "base64signature==",
                certificateChain: ["base64cert1", "base64cert2"],
            },
        ],
    }
);
```

```javascript
// Send Link V2
await sock.sendLinkV2(
    jid,
    "🔎 BAILEYS INTELLIGENCE\n\n- {{IE_0}}Official Baileys Docs{{/IE_0}}\n- {{IE_1}}Baileys GitHub{{/IE_1}}",
    [
        {
            url: "https://www.npmjs.com/package/baileys",
            displayName: "Official Docs",
            sourceDisplayName: "NPM",
            sourceSubtitle: "Registry",
        },
        {
            url: "https://github.com/WhiskeySockets/Baileys",
            displayName: "GitHub Repo",
            sourceDisplayName: "GitHub",
            sourceSubtitle: "Source",
        },
    ],
    m,
    {
        headerText: "⚡ BAILEYS SYSTEM",
        footer: "Reference Network",
        searchEngine: "BAILEYS-MAME",
    },
);
```

```javascript
// Send Rich Message
await sock.sendRichMessage(
    jid,
    [
        { messageType: 2, messageText: "📊 BAILEYS INSIGHTS:" },
        {
            messageType: 4,
            tableMetadata: {
                title: "📈 REAL-TIME STATS",
                rows: [
                    { items: ["Parameter", "Value"], isHeading: true },
                    { items: ["Users", "1000+"] },
                    { items: ["Uptime", "99.9%"] },
                ],
            },
        },
        { messageType: 2, messageText: "🛠️ BAILEYS DEBUGGER:" },
        {
            messageType: 5,
            codeMetadata: {
                codeLanguage: "javascript",
                codeBlocks: [{ highlightType: 0, codeContent: 'console.log("Baileys Operational")' }],
            },
        },
    ],
    m,
);
```
</div>
</details>

---

<div align="center">

### 🎬 Media Messages

<table>
<tr>
<td align="center" width="33%">

**🖼️ Images**
JPG, PNG, WebP support

</td>
<td align="center" width="33%">

**🎥 Videos**
MP4, AVI with captions

</td>
<td align="center" width="33%">

**🎵 Audio**
Voice notes & music

</td>
</tr>
</table>

</div>

### 🖼️ Image Message
```javascript
const fs = require("fs");

await sock.sendMessage(jid, {
    image: { url: "./path/to/image.jpg" },
    caption: "Beautiful image! 📸"
});

// Atau dengan Buffer
await sock.sendMessage(jid, {
    image: fs.readFileSync("./image.jpg"),
    caption: "Beautiful image! 📸"
});
```

### 🎥 Video Message
```javascript
await sock.sendMessage(jid, {
    video: { url: "./path/to/video.mp4" },
    caption: "Check this out! 🎬",
    ptv: false // Set to true for video note
});
```

### 🎵 Audio Message
```javascript
await sock.sendMessage(jid, {
    audio: { url: "./path/to/audio.mp3" },
    mimetype: "audio/mp4",
    ptt: true // true untuk voice note
});
```

---

## 📊 Implementing a Data Store

<div align="center">

> [!IMPORTANT]
> **Production Ready:** Build your own data store for production. The in-memory store is just for testing!

</div>

```javascript
const { makeInMemoryStore } = require("@waguri/baileys");
const fs = require("fs");

const store = makeInMemoryStore({});

// Load from file
if (fs.existsSync("./baileys_store.json")) {
    store.readFromFile("./baileys_store.json");
}

// Auto-save every 10 seconds
setInterval(() => {
    store.writeToFile("./baileys_store.json");
}, 10_000);

// Bind to socket
const sock = makeWASocket({});
store.bind(sock.ev);

// Access stored data
sock.ev.on("chats.upsert", () => {
    console.log("💬 Chats:", store.chats.all());
});
```

---

## 👥 Groups

<div align="center">

### 🎯 Group Management Features

<table>
<tr>
<td align="center" width="25%">

**🆕 Create**  
New groups

</td>
<td align="center" width="25%">

**👤 Members**  
Add/Remove users

</td>
<td align="center" width="25%">

**⚙️ Settings**  
Name, description

</td>
<td align="center" width="25%">

**🛡️ Admin**  
Promote/Demote

</td>
</tr>
</table>

</div>

### 🆕 Create a Group
```javascript
const group = await sock.groupCreate("🎉 My Awesome Group", [
    "6281234567890@s.whatsapp.net",
    "6289876543210@s.whatsapp.net"
]);

console.log("✅ Group created:", group.id);
await sock.sendMessage(group.id, { text: "Welcome everyone! 👋" });
```

### 👤 Add/Remove Participants
```javascript
await sock.groupParticipantsUpdate(
    groupJid,
    ["6281234567890@s.whatsapp.net"],
    "add" // 'remove', 'promote', 'demote'
);
```

### ⚙️ Change Group Settings
```javascript
// Update group name
await sock.groupUpdateSubject(groupJid, "🚀 New Group Name");

// Update description
await sock.groupUpdateDescription(groupJid, "📝 New group description");

// Admin-only messages
await sock.groupSettingUpdate(groupJid, "announcement");

// Everyone can send messages
await sock.groupSettingUpdate(groupJid, "not_announcement");
```

---

## 🔒 Privacy

<div align="center">

### 🛡️ Privacy Controls

<table>
<tr>
<td align="center" width="50%">

**🚫 Block Management**  
Block/Unblock users

</td>
<td align="center" width="50%">

**⚙️ Privacy Settings**  
Visibility controls

</td>
</tr>
</table>

</div>

### 🚫 Block/Unblock Users
```javascript
// Block user
await sock.updateBlockStatus(jid, "block");

// Unblock user  
await sock.updateBlockStatus(jid, "unblock");
```

### ⚙️ Privacy Settings
```javascript
// Update various privacy settings
await sock.updateLastSeenPrivacy("contacts"); // 'all', 'contacts', 'none'
await sock.updateOnlinePrivacy("all"); // 'all', 'match_last_seen'
await sock.updateProfilePicturePrivacy("contacts");
await sock.updateStatusPrivacy("contacts");
await sock.updateReadReceiptsPrivacy("all"); // 'all', 'none'
```

---

## 🐛 Debugging

<div align="center">

**🔍 Enable debug mode to see all WhatsApp communications:**

</div>

```javascript
const P = require("pino");

const sock = makeWASocket({
    logger: P({ level: "debug" }),
});
```

### 🎯 Custom Event Handlers
```javascript
// Listen for specific WebSocket events
sock.ws.on("CB:edge_routing", (node) => {
    console.log("📡 Edge routing message:", node);
});

// Listen with specific attributes
sock.ws.on("CB:edge_routing,id:abcd", (node) => {
    console.log("🎯 Specific edge routing message:", node);
});
```

---

<div align="center">

<br>

✨ Terima kasih sudah menggunakan Baileys kami! ✨  
🙏 Terima kasih juga atas support kalian yang luar biasa! 🙏

</div>
