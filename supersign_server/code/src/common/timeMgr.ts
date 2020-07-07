import { bindTask } from "../task/changeActTask";
import { signActDao } from "../models/signActDao";

/* 时间管理，需要长期执行的定时任务统一放这里 */
class TimerMgr {
    public init(): void {
        this.timerChangeAct();
        this.timerUpdateActExpired();
    }

    /**
     * 切换账号任务,每30分钟跑一次
     */
    private timerChangeAct(): void {
        bindTask.expireIpas();
        setInterval(() => {
            bindTask.expireIpas();
        }, 1 * 30 * 60000);
    }
    /**
     * 更新账号过期时间，每12小时更新一次
     */
    private timerUpdateActExpired() {
        setInterval(() => {
            signActDao.initData();
        }, 1 * 60 * 12 * 60000);
    }
}

export const timerMgr = new TimerMgr();