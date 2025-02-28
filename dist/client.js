"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupaLitePG = exports.SupaliteClient = void 0;
const postgres_client_1 = require("./postgres-client");
class SupaliteClient extends postgres_client_1.SupaLitePG {
    constructor(config) {
        super(config);
    }
}
exports.SupaliteClient = SupaliteClient;
var postgres_client_2 = require("./postgres-client");
Object.defineProperty(exports, "SupaLitePG", { enumerable: true, get: function () { return postgres_client_2.SupaLitePG; } });
__exportStar(require("./types"), exports);
__exportStar(require("./errors"), exports);
