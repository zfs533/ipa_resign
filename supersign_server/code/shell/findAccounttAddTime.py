# -*- coding: utf-8 -*-
from concurrent.futures import ProcessPoolExecutor
import json
import sys
import os
import re


def readCookieCreateTime(cookiePath):
    """读取cookie文件内容获取创建时间

    Arguments:
        cookiePath {str} -- cookie文件的路径

    Returns:
        {dict} -- 返回账号与创建时间的列表
    """

    actInfo = {}
    with open(cookiePath) as f:
        cookieStr = f.read()
        createDate_l = re.findall(r"created_at: (.+?) +", cookieStr)
        createDate = createDate_l[1] if createDate_l[0] == "&1" else createDate_l[0]
        actInfo['act'] = cookiePath.split('/')[-2]
        actInfo['time'] = createDate
    return actInfo


if __name__ == '__main__':
    filePaths = sys.argv[1]
    # spaceship 账号cookie的根目录
    spaceshipRootPath = os.path.join(os.environ['HOME'], ".fastlane/spaceship")

    # spaceship 账号的cookie路径
    spaceshipPath = os.path.join(spaceshipRootPath, "{0}", "cookie")

    # spaceship 的账号列表
    actList = os.listdir(spaceshipRootPath)
    try:
        actList.remove(".DS_Store")
    except ValueError as e:
        pass

    # spaceship 账号cookie路径的列表
    actCookiePathList = [spaceshipPath.format(act) for act in actList]

    # 利用进程池读取每个账号cookie的最后创建时间
    p = ProcessPoolExecutor()
    actCreateTimeList = list(p.map(readCookieCreateTime, actCookiePathList))
    p.shutdown()

    fo = open(filePaths, "w")
    fo.write(json.dumps(actCreateTimeList))
    fo.close()

    # print(json.dumps(actCreateTimeList))
