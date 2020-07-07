# -*- coding: utf-8 -*-
import zipfile
import sys
import os
from PIL import Image  # sudo pip install Pillow
from struct import unpack, pack
from zlib import compress, crc32, decompress
import stat


def getNormalizedPNG(filename):
    """
    把iPhone png 转为正常的png

    Args:
        需要转化的图片路径

    Returns:
        返回图片数据
    """

    pngheader = "\x89PNG\r\n\x1a\n"

    file = open(filename, "rb")
    oldPNG = file.read()
    file.close()

    if oldPNG[:8] != pngheader:
        return None

    newPNG = oldPNG[:8]

    chunkPos = len(newPNG)

    idatAcc = ""
    breakLoop = False

    # For each chunk in the PNG file
    while chunkPos < len(oldPNG):
        skip = False

        # Reading chunk
        chunkLength = oldPNG[chunkPos:chunkPos+4]
        chunkLength = unpack(">L", chunkLength)[0]
        chunkType = oldPNG[chunkPos+4: chunkPos+8]
        chunkData = oldPNG[chunkPos+8:chunkPos+8+chunkLength]
        chunkCRC = oldPNG[chunkPos+chunkLength+8:chunkPos+chunkLength+12]
        chunkCRC = unpack(">L", chunkCRC)[0]
        chunkPos += chunkLength + 12

        # Parsing the header chunk
        if chunkType == "IHDR":
            width = unpack(">L", chunkData[0:4])[0]
            height = unpack(">L", chunkData[4:8])[0]

        # Parsing the image chunk
        if chunkType == "IDAT":
            # Store the chunk data for later decompression
            idatAcc += chunkData
            skip = True

        # Removing CgBI chunk
        if chunkType == "CgBI":
            skip = True

        # Add all accumulated IDATA chunks
        if chunkType == "IEND":
            try:
                # Uncompressing the image chunk
                bufSize = width * height * 4 + height
                chunkData = decompress(idatAcc, -15, bufSize)

            except Exception as e:
                print(e)
                return None

            chunkType = "IDAT"

            # Swapping red & blue bytes for each pixel
            newdata = ""
            for y in range(height):
                i = len(newdata)
                newdata += chunkData[i]
                for x in range(width):
                    i = len(newdata)
                    newdata += chunkData[i+2]
                    newdata += chunkData[i+1]
                    newdata += chunkData[i+0]
                    newdata += chunkData[i+3]

            # Compressing the image chunk
            chunkData = newdata
            chunkData = compress(chunkData)
            chunkLength = len(chunkData)
            chunkCRC = crc32(chunkType)
            chunkCRC = crc32(chunkData, chunkCRC)
            chunkCRC = (chunkCRC + 0x100000000) % 0x100000000
            breakLoop = True

        if not skip:
            newPNG += pack(">L", chunkLength)
            newPNG += chunkType
            if chunkLength > 0:
                newPNG += chunkData
            newPNG += pack(">L", chunkCRC)
        if breakLoop:
            break

    return newPNG


def updatePNG(filename):
    """
    把一个iPhone 图片更新为正常图片

    Args：
        图片路径
    Returns：
        更新成功返回True，否则返回False
    """
    data = getNormalizedPNG(filename)
    if data != None:
        file = open(filename, "wb")
        file.write(data)
        file.close()
        return True
    return False


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python extractIcon.py xxx.ipa outimage.png')

    ipa_path = sys.argv[1]
    outIcon_path = sys.argv[2]
    root_path = os.path.dirname(outIcon_path)

    ipa_file = zipfile.ZipFile(ipa_path)
    name_list = ipa_file.namelist()
    icon_list = []
    for file in name_list:
        filename = os.path.basename(file)
        if filename.startswith("AppIcon"):
            ipa_file.extract(file, root_path)
            icon_list.append(file)

    max_icon = max(icon_list, key=lambda icon: Image.open(
        os.path.join(root_path, icon)).size[0])
    icon_path = os.path.join(root_path, max_icon)
    updatePNG(icon_path)
    icon_image = Image.open(icon_path)
    icon_image = icon_image.resize((512, 512), Image.ANTIALIAS)
    icon_image.save(outIcon_path)

    rmpath = os.path.join(root_path, max_icon.split('/')[0])
    os.system("rm -rf \"%s\"" % rmpath)
