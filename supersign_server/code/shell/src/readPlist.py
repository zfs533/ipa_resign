# -*- coding: utf-8 -*
import sys
import plistlib
from io import StringIO
from addict import Dict


def load_plistlib(plist_path):

    plist = open(plist_path, "rb").read()
    plist_data = plistlib.loads(plist)
    return plist_data


if __name__ == '__main__':

    plist_path = sys.argv[1]
    key = sys.argv[2]

    plist_data = load_plistlib(plist_path)
    plist_dict = Dict(plist_data)

    if len(sys.argv) > 3 and sys.argv[3] == '-x':
        ps = plistlib.dumps(plist_data[key])
        print(ps.decode())
    elif len(sys.argv) > 3 and sys.argv[3] == '-s':
        plist_data[key] = sys.argv[4]
        with open(plist_path, 'wb') as fp:
            plistlib.dump(plist_data, fp)

    if ":" in key:
        keys = key.split(':')
        print(plist_dict[keys[0]][keys[1]])
    else:
        if key in plist_data:
            print(plist_data[key])
