import terminal from 'terminal-kit';
import * as vConst from '../constants/validator_constants.js'


let term = terminal.terminal;


/**
 * creates a table by selected properties
 * @param {*} headers of table
 * @param {*} w width
 */
 let createTable = function(headers, w) {
    term.table(headers , 
        {
        hasBorder: true ,
        contentHasMarkup: true ,
        borderChars: 'lightRounded' ,
        borderAttr: { color: 'blue' } ,
        textAttr: { bgColor: 'default' } ,
        // firstCellTextAttr: { bgColor: 'blue' } ,
        firstRowTextAttr: { bgColor: 'grey' } ,
        // firstColumnTextAttr: { bgColor: 'red' } ,
        width: w ,
        fit: true   // Activate all expand/shrink + wordWrap
    }
    ) ;
}


/**
 * 
 * @param {*} upF array of updated files
 */
 function printUpdatedFiles(upF) {
    if (upF.length) {
        term.yellow(`\nChanges are applied for the following files:\n`);
        for (let i=0; i<upF.length; i++) {
            term.brightBlue.bold(`${upF[i]}\n`);
        }
    } else {
        term.yellow(`\nNo mock data has been updated.\n`);
    }
    console.log("\nSUGGESTION: Please rerun your exiting test cases affected by this changes to check the updates correctness with MOCK data usage.\n");
}


/**
 * 
 * @param {*} pathArr array containing properties of the path
 * @returns path with "." delimiter
 */
 function createJsonPath(pathArr) {
    let jsonPath =  pathArr.reduce(function (previousValue, currentValue) {
        return (typeof(currentValue) == 'number') ? previousValue.slice(0,-1).concat(
            `[${currentValue}].`) : previousValue.concat(`${currentValue}.`);;
    } , '');
    return jsonPath.slice(0, -1);
}


/**
 * 
 * @param {*} dArr array of differences
 * @param {*} cArr constructed array
 */
 function createReqResPath(dArr, cArr) {
    if (dArr.path.includes("request")) {
        cArr[dArr.path[1]].request.push(
            createJsonPath(dArr.path.slice(dArr.path.indexOf('request')+1)));
    }

    if (dArr.path.includes("response")) {
        cArr[dArr.path[1]].response.push(
            createJsonPath(dArr.path.slice(dArr.path.indexOf('response')+1)));
    }
}


/**
 * uses createJsonPath function when "Property was modified"
 * @param {*} el nth element of body diff
 * @param {*} h head for creating a table by terminal-kit
 * @param {*} bp path to differences in body
 */
 function createJsonPathWhenPropertyWasModified(el, h, bp) {
    if (el.action === vConst.MODIFIED) {
        h.push([
            el.action,
            bp + "." + createJsonPath(el.path), 
            JSON.stringify(el.mock), 
            JSON.stringify(el.real)
        ])
    } else {
        h.push([
            el.action,
            bp, 
            JSON.stringify(el.mock), 
            JSON.stringify(el.real)
        ])
    }
}


export { createTable, printUpdatedFiles, createJsonPath, createReqResPath, createJsonPathWhenPropertyWasModified };
