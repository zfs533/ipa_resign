import * as mongodb from "mongodb";
import { Connection, createConnection, Model, QueryFindOneAndUpdateOptions, Schema, SchemaDefinition, SchemaOptions, ModelUpdateOptions } from 'mongoose';
import { logger } from '../common/logger';
import { CodeMsgAny, ErrCode, CodeMsg } from "../common/codeMsg";
import { removeUndefined, isEmptyObject, bytesToUuid } from "../common/userIdentify";
import { ModelAny } from "./modelBaseDao";
import { udidTokenLogDAO } from "./udidTokenLogDao";
import { signActDao } from "./signActDao";
import { adminUserDao } from "./adminDao";
import { ipaFilesDao } from "./ipaFileDao";
import { systemLogDAO } from "./systemLogDao";
import { ipBlackListDao } from "./blackIPListDao";
import { allowUserDao } from "./allow_user";
import { relationDao } from "./relationDao";
import { statisticsDao } from "./statisticsDao";
import { activationDao } from "./activationDao";
import { getChangeDate } from "../common/utils";

export interface ConnectOpts {
    poolSize: number;
    autoReconnect: boolean;
    reconnectTries: number;
    keepAlive: number;
    connectTimeoutMS: number;
}

export interface MongoWriteResult {
    n: number,
    nModified: number,
    upserted: any,
    ok: number,
}
/* 创建modle参数Object */
export interface CreateModelArgs {
    //表名
    name: string;
    //表结构
    schema?: Schema;
    schemaDefinition?: SchemaDefinition;
}

/*Session*/
export type TransSession = mongodb.ClientSession;
export interface TransOpts {
    session?: TransSession
}

export enum ReadPreference {
    P = "primary",
    SP = "secondaryPreferred",
    // PP = "primaryPreferred",
    // s = "secondary",
    // n = "nearest",
}

export interface TransInsertOptions extends TransOpts { ordered?: boolean, rawResult?: boolean }

/* mongoDb 数据库操作工具类 增，删，查，改*/
export class MongoDbUtil {
    private static _conn: Connection;

    public static readonly defaultSchemaOptions: SchemaOptions = { versionKey: false, toObject: { getters: true, virtuals: true }, strict: "throw", id: false };
    /**
     * 连接数据库，初始化所有表
     * @param url 连接数据库地址
     */
    public static async initAllModels(url: string) {
        let conn: Connection;
        try {
            conn = await createConnection(url, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                poolSize: 2,
                useCreateIndex: true,
                autoReconnect: true,
                reconnectTries: Number.MAX_VALUE,
                keepAlive: true,
                connectTimeoutMS: 5000,
                useFindAndModify: false
            })
        } catch (reason) {
            logger.error("initLogModels err reason:", reason);
        }
        if (!conn) {
            return;
        }
        await Promise.all([
            udidTokenLogDAO.init(conn),
            signActDao.init(conn),
            adminUserDao.init(conn),
            ipaFilesDao.init(conn),
            systemLogDAO.init(conn),
            ipBlackListDao.init(conn),
            allowUserDao.init(conn),
            relationDao.init(conn),
            activationDao.init(conn),
            statisticsDao.init(conn),
        ]);
        MongoDbUtil._conn = conn;
        return conn;
    }

    /**
     * 以毫秒为单位获取时间差
     * @param a Date对象
     * @param b Date对象
     */
    public static diff(a: Date, b: Date): number {
        return a.getTime() - b.getTime();
    }

    /**
     * 创建一张表
     * @param conn Connection数据库连接对象
     * @param args CreateModelArgs { name: string;schema?: Schema;schemaDefinition?: SchemaDefinition;}
     */
    public static createModel(conn: Connection, args: CreateModelArgs): ModelAny {
        let schema = args.schema;
        if (!schema) {
            schema = new Schema(args.schemaDefinition, MongoDbUtil.defaultSchemaOptions);
        }
        return conn.model(args.name, schema, args.name);
    }

    /**
     * 向表中插入数据（可同时插入多行)
     * @param model 要插入数据的表
     * @param doc 要插入表中的行
     * @param opts 当前会话session
     * @return CodeMsg<T> {code: ErrCode;msg?: T;err?: any;}
     */
    public static insert(model: ModelAny, doc: any, opts?: TransInsertOptions): Promise<CodeMsgAny> {
        return new Promise<CodeMsgAny>(resolve => {
            if (opts && removeUndefined(opts) && isEmptyObject(opts)) {
                opts = undefined;
            }
            model.insertMany(doc, opts, (err: any, res: any[]) => {
                if (err) {
                    logger.error(`[${model.modelName}] [insert] doc:${JSON.stringify(doc)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }
                res = res ? res.map(e => e.toObject()) : [];
                resolve({ code: ErrCode.OK, msg: res });
            })
        })
    }

    /**
     * 根据条件从表中删除某一行
     * @param model 要删除行的表
     * @param conditions 删除条件
     * @param opts 操作选项
     * @return CodeMsg<T> {code: ErrCode;msg?: T;err?: any;}
     */
    public static deleteOne(model: ModelAny, conditions: any, opts?: TransOpts): Promise<CodeMsg<mongodb.DeleteWriteOpResultObject>> {
        return new Promise<CodeMsgAny>(resolve => {
            model.deleteOne(conditions).setOptions(opts).exec((err: any, result?: any) => {
                if (err) {
                    logger.error(`[${model.modelName}] [deleteOne] conditions:${JSON.stringify(conditions)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }
                resolve({ code: ErrCode.OK, msg: result });
            })
        })
    }

    /**
     * 根据条件从表中删除多行
     * @param model 要删除行的表
     * @param conditions 删除条件
     * @param opts 操作选项
     * @return CodeMsg<T> {code: ErrCode;msg?: T;err?: any;}
     */
    public static deleteMany(model: ModelAny, conditions: any, opts?: TransOpts): Promise<CodeMsg<mongodb.DeleteWriteOpResultObject>> {
        return new Promise<CodeMsgAny>(resolve => {
            logger.info(`[${model.modelName}] [deleteMany] conditions:${JSON.stringify(conditions)}`);
            let startTime = Date.now();
            model.deleteMany(conditions).setOptions(opts).exec((err: any, result?: any) => {
                logger.debug(`[${model.modelName}] [deleteMany] conditions:${JSON.stringify(conditions)} time:${Date.now() - startTime}ms`);
                if (err) {
                    logger.error(`[${model.modelName}] [remove] conditions:${JSON.stringify(conditions)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }
                resolve({ code: ErrCode.OK, msg: result });
            })
        })
    }

    /**
     * 根据条件从标中查找某一行
     * @param model 表对象
     * @param conditions 查询条件
     * @param sort 排序依据 -1 倒序，1 顺序
     * @param projection 
     * @param opts Session
     * @param readPreference 查询优先级，默认为主key
     */
    public static findOne(model: ModelAny, conditions: any, sort?: any, projection?: any, opts?: TransOpts, readPreference: ReadPreference = ReadPreference.P): Promise<CodeMsgAny> {
        return new Promise(resolve => {
            if (opts && removeUndefined(opts) && isEmptyObject(opts)) {
                opts = undefined;
            }

            let query = model.findOne(conditions, projection, opts).read(readPreference);
            if (sort) {
                query = query.sort(sort);
            }
            query.exec((err, res) => {
                if (err) {
                    logger.error(`[${model.modelName}] [findOne] conditions:${JSON.stringify(conditions)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }
                res = res ? res.toObject() : undefined;
                resolve({ code: ErrCode.OK, msg: res });
            })
        })
    }

    /**
     * 根据条件从表中查找行，并更新该行内容
     * @param model 表对象
     * @param conditions 查询条件
     * @param set 更新操作 $set,$unset
     * @param setOnInsert 
     * @param options 
     */
    public static findOneAndUpdate(model: ModelAny, conditions: object, set: object, setOnInsert?: object, options?: QueryFindOneAndUpdateOptions): Promise<CodeMsgAny> {
        return new Promise<CodeMsgAny>(resolve => {
            options = options || { new: true };
            let update: any;
            if (setOnInsert) {
                update = {};
                if (!options.upsert) {
                    options.upsert = true;
                }
                update.$setOnInsert = setOnInsert;
                update.$set = set;
            } else {
                update = set;
            }
            if (options && options.new === undefined) {
                options.new = true;
            }
            model.findOneAndUpdate(conditions, update, options, (err: any, doc: any, res: any) => {
                if (err) {
                    logger.error(`[${model.modelName}] [findOneAndUpdate] conditions:${JSON.stringify(conditions)} update:${JSON.stringify(update)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }
                doc = doc ? doc.toObject() : undefined;
                resolve({ code: ErrCode.OK, msg: doc });
            })
        })
    }

    /**
     *  根据条件从表中查询符合条件的多行
     * @param model 表对象
     * @param conditions 查询条件
     * @param readPreference 查询优先级，默认为主key
     */
    public static total(model: ModelAny, conditions: any, readPreference: ReadPreference = ReadPreference.P): Promise<CodeMsg<number>> {
        return new Promise<CodeMsgAny>(resolve => {
            model.find().read(readPreference).countDocuments(conditions, (err: any, count: number) => {
                if (err) {
                    logger.error(`[${model.modelName}] [findCount] conditions:${JSON.stringify(conditions)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }

                resolve({ code: ErrCode.OK, msg: count });
            })
        })
    }

    /**
     * 根据条件从表中查询符合条件的多行
     * @param model 表对象
     * @param conditions 查询条件
     * @param sort 排序 -1 倒序，1 顺序
     * @param page 页数
     * @param count 展示的行数
     * @param projection 
     * @param opts 
     * @param readPreference 查询优先级，默认为主key
     */
    public static findMany(model: ModelAny, conditions: any, sort?: any, page?: number, count?: number, projection?: any, opts?: TransOpts, readPreference: ReadPreference = ReadPreference.P): Promise<CodeMsg<any[]>> {
        return new Promise(resolve => {
            if (opts && removeUndefined(opts) && isEmptyObject(opts)) {
                opts = undefined;
            }
            let query = model.find(conditions, projection, opts).read(readPreference); // sp
            if (sort) {
                query = query.sort(sort);
            }
            if (page && count) { //必须同时存在
                query = query.skip((page - 1) * count).limit(count * 1);
            }
            query.exec((err, res) => {
                if (err) {
                    logger.error(`[${model.modelName}] [findMany] conditions:${JSON.stringify(conditions)} sort:${JSON.stringify(sort)} page:${page} count:${count} projection:${JSON.stringify(projection)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }
                res = res ? res.map(e => e.toObject()) : [];
                resolve({ code: ErrCode.OK, msg: res });
            })
        })
    }

    /**
     * 根据条件更新一行数据
     * @param model 表对象
     * @param conditions 查询条件
     * @param set 更新操作 {$set:{item1:"",item2:""}}
     * @param setOnInsert 
     * @param options 
     */
    public static updateOne(model: ModelAny, conditions: object, set: object, setOnInsert?: object, options?: ModelUpdateOptions): Promise<CodeMsg<MongoWriteResult>> {
        return new Promise<CodeMsg<MongoWriteResult>>(resolve => {
            let update: any;
            if (setOnInsert) {
                update = {};
                if (!options) {
                    options = {};
                }
                if (!options.upsert) {
                    options.upsert = true;
                }
                update.$setOnInsert = setOnInsert;
                update.$set = set;
            } else {
                update = set;
            }
            model.updateOne(conditions, update, options)
                .exec((err: any, res: any) => {
                    if (err) {
                        logger.error(`[${model.modelName}] [updateOne] conditions:${JSON.stringify(conditions)} set:${JSON.stringify(set)} setOnInsert:${JSON.stringify(setOnInsert)} update:${JSON.stringify(update)} err:${err}`);
                        resolve({ code: ErrCode.MongoErr, err: err });
                        return;
                    }
                    resolve({ code: ErrCode.OK, msg: res });
                })
        })
    }
    /**
     * 根据条件批量更新
     * @param model 表对象
     * @param conditions 查询条件
     * @param set 更新操作 {$set:{item1:"",item2:""}}
     * @param setOnInsert 
     * @param options 
     */
    public static updateMany(model: ModelAny, conditions: object, set: object, setOnInsert?: object, options?: ModelUpdateOptions): Promise<CodeMsg<MongoWriteResult>> {
        return new Promise<CodeMsg<MongoWriteResult>>(resolve => {
            let update: any;
            if (setOnInsert) {
                update = {};
                if (!options) {
                    options = {};
                }
                if (!options.upsert) {
                    options.upsert = true;
                }
                update.$setOnInsert = setOnInsert;
                update.$set = set;
            } else {
                update = set;
            }
            model.updateMany(conditions, update, options)
                .exec((err: any, res: any) => {
                    if (err) {
                        logger.error(`[${model.modelName}] [updateMany] conditions:${JSON.stringify(conditions)} set:${JSON.stringify(set)} setOnInsert:${JSON.stringify(setOnInsert)} update:${JSON.stringify(update)} err:${err}`);
                        resolve({ code: ErrCode.MongoErr, err: err });
                        return;
                    }
                    resolve({ code: ErrCode.OK, msg: res });
                })
        })
    }

    /**
     * 查询符合条件的总量
     * @param model 表对象
     * @param conditions 查询条件
     * @param readPreference 查询优先级，默认为主key
     */
    public static findCount(model: ModelAny, conditions: any, readPreference: ReadPreference = ReadPreference.P): Promise<CodeMsg<number>> {
        return new Promise<CodeMsg<number>>(resolve => {
            model.find().read(readPreference).countDocuments(conditions, (err: any, count: number) => {
                if (err) {
                    logger.error(`[${model.modelName}] [findCount] conditions:${JSON.stringify(conditions)} err:${err}`);
                    resolve({ code: ErrCode.MongoErr, err: err });
                    return;
                }
                resolve({ code: ErrCode.OK, msg: count });
            })
        })
    }

    /**
     * 开启一个事务，如果不返回200, 那么事务回滚
     * @param ops 当前会话Session,当前要执行的任务
     */
    public static async runTrans<T>(ops: (session: TransSession) => Promise<CodeMsgAny>): Promise<CodeMsg<T>> {
        let startTick = getChangeDate();
        /* 获取当前事务会话Session */
        let sessionRet = await MongoDbUtil.startSession(MongoDbUtil._conn);
        if (sessionRet.code !== ErrCode.OK) {
            logger.error("mongoUtil runTrans startSession ret:", JSON.stringify(sessionRet));
            return { code: sessionRet.code, err: sessionRet.err };
        }
        let session = sessionRet.msg;
        /* 开启事务 */
        let doRet = await MongoDbUtil.doTransWithRetry(ops, session);
        /* 终止当前会话Session */
        let endRet = await MongoDbUtil.endSession(session);
        if (endRet.code !== ErrCode.OK) {
            logger.error("mongoUtil runTrans endSession endRet:", JSON.stringify(endRet));
        }
        let endTick = getChangeDate();
        if (doRet.code === ErrCode.OK) {
            logger.info("mongoUtil runTrans ok time cost:" + MongoDbUtil.diff(endTick, startTick) + "ms");
        } else {
            logger.error("mongoUtil runTrans not ok time cost:" + MongoDbUtil.diff(endTick, startTick) + "ms", "ret", JSON.stringify(doRet));
        }
        return doRet;
    }

    /**
     * 得到当前事务会话Session
     * @param conn  数据库连接对象
     */
    public static async startSession(conn: Connection): Promise<CodeMsg<TransSession>> {
        try {
            let session = await conn.startSession();
            logger.debug('mongoUtil startSession:', MongoDbUtil.sessionId(session));
            return { code: ErrCode.OK, msg: session };
        } catch (e) {
            logger.error('mongoUtil startSession err:', e);
            return { code: ErrCode.StartSessionErr, err: e };
        }
    }

    public static sessionId = (session: TransSession) => {
        return bytesToUuid(session.id.id.buffer);
    }

    //https://docs.mongodb.com/master/reference/method/Session.abortTransaction/#Session.abortTransaction
    /**
     * 开始走事务流程
     * @param doTrans 
     * @param session 
     * @param retry 
     */
    public static async doTransWithRetry(doTrans: (session: TransSession) => Promise<CodeMsgAny>, session: TransSession, retry: number = Infinity): Promise<CodeMsgAny> {
        let cnt = 0;
        /* 当前执行的事务id */
        let id = MongoDbUtil.sessionId(session);
        while (true) {
            /* 真正的开启事务 */
            let startRet = MongoDbUtil.startTrans(session);
            if (startRet.code !== ErrCode.OK) {
                logger.error('mongoUtil doTransWithRetry startTrans doId:', id, 'ret:', JSON.stringify(startRet), "retryCount:", cnt);
                return startRet; //开启事务失败，返回
            }
            try {
                /* 真正的执行事务 */
                let ret = await doTrans(session);
                if (ret.code !== ErrCode.OK) {
                    /* 执行出错，开始事务回滚 */
                    let abortRet = await MongoDbUtil.abortTrans(session);
                    if (abortRet.code !== ErrCode.OK) {
                        logger.error('mongoUtil doTransWithRetry abortTrans doId:', id, 'ret:', JSON.stringify(abortRet), "retryCount:", cnt);
                        return ret;
                    }
                    /* 回滚成功, 检查是否允许重试 */
                    let error = ret.err;
                    let canRetry = retry > 0 && error && error.errorLabels && error.errorLabels.includes('TransientTransactionError');
                    if (!canRetry) {
                        /* 这次是不允许事务重试的，返回 */
                        logger.error('mongoUtil doTransWithRetry cantRetry', JSON.stringify(error), 'doId:', id, 'retry:', retry);
                        return ret;
                    } else {
                        retry--;
                        cnt++;
                        logger.info('mongoUtil doTransWithRetry TransientTransactionError', JSON.stringify(error), 'doId:', id, ' retryCount', cnt, 'remainRetry', retry);
                        continue;
                    }
                } else {
                    /* 执行OK, 提交事务 */
                    let cmtRet = await MongoDbUtil.commitTransWithRetry(session);
                    if (cmtRet.code !== ErrCode.OK) {
                        //TODO: 这里需要回滚吗？
                        let abortRet = await MongoDbUtil.abortTrans(session);
                        if (abortRet.code !== ErrCode.OK) {
                            logger.error("mongoUtil doTransWithRetry commitTransWithRetry fail abortTrans ret:", JSON.stringify(abortRet), 'doId:', id);
                        }
                        return cmtRet;
                    }
                    /* 把doTrans的结果返回，当前事务结果 */
                    return { code: ErrCode.OK, msg: ret.msg };
                }
            } catch (e) {
                /* 逻辑异常， 直接回滚 */
                logger.error("mongoUtil doTransWithRetry exception:", e, "now abortTrans.", 'doId:', id);
                let abortRet = await MongoDbUtil.abortTrans(session);
                if (abortRet.code !== ErrCode.OK) {
                    logger.error("mongoUtil doTransWithRetry commitTransWithRetry fail abortTrans ret:", JSON.stringify(abortRet), 'doId:', id);
                }
                return { code: ErrCode.RunTransErr, err: e };
            }
        }
    }

    /**
     * 开启一次事务 
     * @param session 当前事务会话Session
     */
    private static startTrans(session: TransSession) {
        try {
            /* 开启一次事务 */
            session.startTransaction();
            return { code: ErrCode.OK };
        } catch (e) {
            return { code: ErrCode.StartTransErr, err: e };
        }
    }

    /**
     * 中止当前的事务，并将事务中执行过的数据修改回滚
     * @param session 当前事务会话Session
     */
    private static async abortTrans(session: TransSession) {
        try {
            /* 中止当前的事务，并将事务中执行过的数据修改回滚 */
            let reply = await session.abortTransaction();
            return { code: ErrCode.OK, msg: reply };
        } catch (e) {
            return { code: ErrCode.AbortTransErr, err: e };
        }
    }

    /**
     * 执行OK, 提交事务
     * @param session 当前事务会话Session
     * @param retry 
     */
    private static async commitTransWithRetry(session: TransSession, retry: number = Infinity): Promise<CodeMsgAny> {
        let cnt = 0;
        while (true) {
            try {
                /* 提交事务 */
                await session.commitTransaction();
                return { code: ErrCode.OK };
            } catch (error) {
                let canRetry = retry > 0 && error.errorLabels && error.errorLabels.includes('UnknownTransactionCommitResult');
                if (!canRetry) { //不能重试, 返回错误
                    logger.info('Error during commit ...', JSON.stringify(error));
                    return { code: ErrCode.CommitTransErr, err: error };
                } else { //允许重试
                    retry--;
                    cnt++;
                    logger.info('mongoUtil commitTrans TransientTransactionError', JSON.stringify(error), ' retryCount', cnt, 'remainRetry', retry);
                    continue;
                }
            }
        }
    }

    /**
     * 事务会话结束
     * @param session 当前事务会话Session
     */
    public static async endSession(session: TransSession): Promise<CodeMsgAny> {
        return new Promise<CodeMsgAny>(resolve => {
            logger.debug('mongoUtil endSession:', MongoDbUtil.sessionId(session));
            session.endSession((err, result) => {
                if (err) {
                    resolve({ code: ErrCode.EndSessionErr, err: err });
                    return;
                }
                resolve({ code: ErrCode.OK, msg: result });
            });
        })
    }

    /**
     * 聚合查询
     * @param model 表对象
     * @param aggegations 查询条件 type:[] 
     * @param opts Session
     * @param readPreference 查询优先级，默认为主key
     */
    public static executeAggregate(model: ModelAny, aggegations: any[], opts?: TransOpts, readPreference: ReadPreference = ReadPreference.P): Promise<CodeMsg<any>> {
        return new Promise<CodeMsg<any>>(resolve => {
            model.aggregate(aggegations).option({ ...opts, allowDiskUse: true }).read(readPreference).exec((err: any, res: any) => {
                if (err) {
                    logger.error(`[aggregate] err:`, err);
                    resolve({ code: ErrCode.MongoErr, msg: undefined, err: err });
                    return;
                }
                resolve({ code: ErrCode.OK, msg: res, err: undefined });
            })
        })
    }

    //plainObject 中的bson字段转为字符串
    //解决第一层
    public static convertDecimalInPlainObject = (res: any) => {
        if (!res) {
            return res;
        }
        if (typeof res !== "object") {
            return res;
        }
        if (res instanceof Array) {
            return res.map(e => MongoDbUtil.convertDecimalInPlainObjectInner(e));
        }
        return MongoDbUtil.convertDecimalInPlainObjectInner(res);
    }

    private static convertDecimalInPlainObjectInner = (res: any) => {
        let ret: any = {};
        Object.keys(res).forEach(k => {
            let v = res[k];
            if (v && typeof v === "object") {
                if (v._bsontype === "Decimal128" || v._bsontype === "ObjectID") {
                    ret[k] = v.toString();
                    return;
                }
            }
            ret[k] = v;
        })
        return ret;
    }
}