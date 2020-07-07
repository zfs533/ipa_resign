# -*- coding: utf-8 -*-
import shutil
import json
import requests
import os
import time


def login(act, pwd):
    """通过ruby脚本进行登陆，更新cookie

    Arguments:
        act {string} -- 账号
        pwd {string} -- 密码
    """

    # 如果存在账号的cookie缓存则删除重新保存
    cookiePath = os.path.join(os.environ['HOME'], ".fastlane/spaceship", act)
    if os.path.exists(cookiePath):
        shutil.rmtree(cookiePath)
    command = "ruby {0} {1} {2}".format(rubyPath, act, pwd)
    print("执行命令： %s " % command)
    os.system(command)


def addAccount(act, pwd):
    """通过POST请求往超级签后台添加账号

    Arguments:
        act {string} -- 账号
        pwd {string} -- 密码
    """

    # 通过登陆请求用来获取token
    loginRequestUrl = "https://supersignweb.com/admin/login"

    # 添加账号的请求
    addActRequestUrl = "https://supersignweb.com/ipa/addAct"

    # 请求头
    headers = {
        'authority': "supersignweb.com",
        'pragma': "no-cache",
        'cache-control': "no-cache,no-cache",
        'accept': "application/json, text/plain, */*",
        'origin': "https://supersignus.com",
        'user-agent':
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 \
            (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
        'content-type': "application/json;charset=UTF-8",
        'sec-fetch-site': "cross-site",
        'sec-fetch-mode': "cors",
        'referer': "https://supersignus.com/",
        'accept-language': "zh-CN,zh;q=0.9",
        'Postman-Token': "2fb30239-6641-4a3f-8dce-870fd39af622"
    }

    data = '{"loginName":"add_apple","password":"d68Q8QZicqp2s3fe"}'
    response = requests.request("POST",
                                loginRequestUrl,
                                data=data,
                                headers=headers)
    token = json.loads(response.text)['msg']['token']

    data = '{"act":"%s","pwd":"%s"}' % (act, pwd)
    headers['authorization'] = token
    response = requests.request("POST",
                                addActRequestUrl,
                                data=data,
                                headers=headers)
    print(response.text)


if __name__ == '__main__':

    # 账号信息文件
    actPath = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "act.txt")

    # 登陆账号的ruby脚本
    rubyPath = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "loginAccount.rb")

    # 文件中读取账号信息
    with open(actPath, 'r') as f:
        lines = f.readlines()

    for line in lines:
        act = line.split('	')[0].strip()
        pwd = line.split('	')[1].strip()
        login(act, pwd)
        addAccount(act, pwd)

        # 间隔60s防止一次性添加10个以上的账号出现验证码发送频繁，无法接收验证码的情况
        time.sleep(60)
