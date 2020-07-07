# -*- coding: utf-8 -*
import sys
import sys
import plistlib
from io import StringIO


def output(s, path):
    plist_data = plistlib.loads(s.encode())
    plist_data["com.apple.developer.icloud-services"] = ['CloudKit']
    with open(path, 'wb') as fp:
        plistlib.dump(plist_data, fp)


if __name__ == '__main__':
    mp_path = sys.argv[1]

    mp_str = str(open(mp_path, 'rb').read())
    first_index = mp_str.find("<plist")
    last_index = mp_str.find("</plist>")
    plist_str = mp_str[first_index:last_index + 8]

    if (len(sys.argv) == 3):
        output(plist_str, mp_path)
    else:
        print(plist_str)
