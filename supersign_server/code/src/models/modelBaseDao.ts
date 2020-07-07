import { Model, Connection } from "mongoose";
import { CodeMsgAny, ErrCode } from "../common/codeMsg";
import { MongoDbUtil } from "./mongoDbUtil";

//定义any model类型
export type ModelAny = Model<any>;

export class ModelBaseDao {
    protected _model!: ModelAny;
    public init = (conn: Connection, args?: any): Promise<CodeMsgAny> => {
        return Promise.resolve<CodeMsgAny>({ code: ErrCode.Unknown });
    }

    public getTotal = (conditions?: any) => {
        if (!conditions) {
            conditions = {};
        }
        return MongoDbUtil.total(this._model, conditions);
    }

    public get modelName(): string {
        return this._model.modelName;
    }
    public get model() {
        return this._model;
    }
}
