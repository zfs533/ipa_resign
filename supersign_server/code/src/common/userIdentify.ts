import { Request } from "express";
import { globalCfg } from "../models/globalCfgDao";
import * as uuid from "uuid";
import { HexBase64Latin1Encoding, createHmac } from "crypto";
import { func } from "joi";
const bytesToUUID = require('uuid/lib/bytesToUuid')
const isPlainObject = require('is-plain-object');


export function generateUserIdentifier(): string {
    return uuid.v4();
}


export function md5(s: string, key: string, encoding: HexBase64Latin1Encoding = 'hex'): string {
    return createHmac('md5', key).update(s).digest(encoding);
}

export function removeUndefined(obj: any) {
    if (isPlainObject(obj) || obj instanceof Array || obj instanceof Map || obj instanceof Set) {
        Object.keys(obj).forEach(key => {
            if (obj instanceof Array) {
                obj.forEach(e => removeUndefined(e))
            } else if (obj instanceof Map) {
                obj.forEach(v => removeUndefined(v))
            } else if (obj instanceof Set) {
                obj.forEach(v => removeUndefined(v))
            } else if (typeof obj[key] === 'object') {
                removeUndefined(obj[key]);
            } else if (obj[key] === undefined) {
                delete obj[key];
            }
        })
    }
    return obj;
}

export function removeNull(obj: any) {
    if (isPlainObject(obj) || obj instanceof Array || obj instanceof Map || obj instanceof Set) {
        Object.keys(obj).forEach(key => {
            if (obj[key] === null) {
                delete obj[key];
            }
            else if (obj instanceof Array) {
                obj.forEach(e => removeNull(e))
            } else if (obj instanceof Map) {
                obj.forEach(v => removeNull(v))
            } else if (obj instanceof Set) {
                obj.forEach(v => removeNull(v))
            } else if (typeof obj[key] === 'object') {
                removeNull(obj[key]);
            }
        })
    }
    return obj;
};

export function removeUndefinedOrNull(obj: any) {
    obj = removeNull(obj);
    obj = removeUndefined(obj);
    return obj;
};

export function isEmptyObject(o: object) {
    return !Object.keys(o).length;
}

export function bytesToUuid(buf: Buffer) {
    return bytesToUUID(buf);
}