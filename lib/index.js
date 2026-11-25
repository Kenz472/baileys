"use strict";

const chalk = require("chalk");

async function typeWriter(text, delay = 15) {
    process.stdout.write("\x1b[?25l"); // sembunyikan kursor
    for (const char of text) {
        process.stdout.write(char);
        await new Promise((r) => setTimeout(r, delay));
    }
    process.stdout.write("\x1b[?25h\n"); // tampilkan kursor
}

async function clearScreenLines(lineCount) {
    for (let i = 0; i < lineCount; i++) {
        process.stdout.write("\x1b[1A\x1b[2K"); // naik 1 baris + hapus baris
    }
}

(async () => {
    const bannerText = `🍒 BAILEYS • CORE REBUILD 🍒
─────────────────────────────────
⚡ Engine baru sudah aktif
🛠️  Bug lama dibersihin total
🚀 Speed naik, stabil, anti ngelag
🔖 Build   : 07 - 2026
👤 Dev     : 6285758459672
💬 Support : chat.whatsapp.com/HlyYOczlYcn9JipRVchJxE
─────────────────────────────────
🙏 Thanks udah setia pakai Baileys kami.`;

    const totalLines = bannerText.split("\n").length + 2;

    process.stdout.write(chalk.cyan.bold(""));
    await typeWriter(chalk.cyan.bold(bannerText), 15);

    await new Promise((r) => setTimeout(r, 3000));

    await clearScreenLines(totalLines);

    console.log(chalk.greenBright.bold(`
╭───────────────────────────────╮
│   ✅  BAILEYS CORE READY  ✅   │
╰───────────────────────────────╯
`));
})();

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));

var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.makeWASocket = void 0;

const Socket_1 = __importDefault(require("./Socket"));
exports.makeWASocket = Socket_1.default;

__exportStar(require("../WAProto"), exports);
__exportStar(require("./Utils"), exports);
__exportStar(require("./Types"), exports);
__exportStar(require("./Store"), exports);
__exportStar(require("./Defaults"), exports);
__exportStar(require("./WABinary"), exports);
__exportStar(require("./WAM"), exports);
__exportStar(require("./WAUSync"), exports);

exports.default = Socket_1.default;


/********* [ Information Author ] *********/

//• Author: Kenz • coding
//• Date: 01-03-2026
//• Time: 04:48 Wib

/********* [ ********************** ] *********/