"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
exports.default = (0, pino_1.default)({ timestamp: () => `,"time":"${new Date().toJSON()}"` });


/********* [ Information Author ] *********/

//• Author: Kenz • coding
//• Date: 01-03-2026
//• Time: 04:48 Wib

/********* [ ********************** ] *********/