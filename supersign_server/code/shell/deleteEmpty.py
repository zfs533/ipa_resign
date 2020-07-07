# -*- coding: utf-8 -*
import os
import sys


def start(path):
    """
    删除目录下所有空文件夹
    """
    for root, dirs, files in os.walk(path, topdown=False):
        if not os.listdir(root):
            os.rmdir(root)


if __name__ == '__main__':
    start(sys.argv[1])
