
const XLSX = require('xlsx');
import * as path from 'path';
import * as fs from "fs";
import { createDir } from "../common/utils";
class ExcelDoc {
    private srcData: any;
    private workbook: any;
    private user: string;
    private filePath: string;
    constructor() {

    }

    /**
     * @param {Object} data Excel表格源数据，格式如下：
     * {
     *      Sheet1: [
     *          ['姓名', '学号', '籍贯'],
     *          ['lxz', '10131911', 'hunan']
     *      ]
     * }
     */
    public createFile(user: string, srcData: any, filePath: string) {
        this.user = user;
        this.srcData = srcData;
        this.filePath = filePath;
        this.workbook = {};
        this.workbook.SheetNames = [];
        this.workbook.Sheets = {};

        for (let item in srcData) {
            this.workbook.SheetNames.push(item);
            this.addSheet(item, srcData[item]);
        }
    }

    /**
     * 往Excel文件添加一个表格
     * @param {string} sheetName 表格名
     * @param {object} sheet 表格数据
     * @returns void
     */
    addSheet(sheetName: any, sheet: any) {
        this.workbook['Sheets'][sheetName] = {};
        let row = sheet.length;
        let col = sheet[0].length;
        let to = '';

        for (let i = 0; i < row; i++) {
            for (let j = 0; j < col; j++) {
                let key = this.ten2twentysix(j + 1) + (i + 1);
                this.workbook['Sheets'][sheetName][key] = { 'v': sheet[i][j] };
                to = key;
            }
        }
        let packageDir = path.join(process.cwd(), `./public/data/`);
        if (!fs.existsSync(packageDir)) {
            createDir(packageDir);
        }
        this.workbook['Sheets'][sheetName]['!ref'] = 'A1:' + to;
        this.writeFile(this.filePath);
    }

    /**
     * 10进制转26进制
     * @param {number} num 正整数
     * @returns string
     */
    ten2twentysix(num: any) {
        let str = '';
        while (num) {
            let rest = num % 26;
            num = (num - rest) / 26;
            str += String.fromCharCode(rest + 64);
        }

        let twentysixNumber = '';
        let len = str.length;
        for (let i = len - 1; i >= 0; i--) {
            twentysixNumber += str[i];
        }

        return twentysixNumber;
    }

    /**
     * 将数据写入Excel
     * @param {string} filename 文件路径
     */
    writeFile(filename: any) {
        XLSX.writeFile(this.workbook, filename);
    }
}
export const excelDoc = new ExcelDoc();