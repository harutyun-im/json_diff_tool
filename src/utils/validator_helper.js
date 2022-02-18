import diff from 'deep-diff';
import promptSync from 'prompt-sync';
import terminal from 'terminal-kit';
import path from 'path';
import fs from 'fs';
import * as vConst from '../constants/validator_constants.js'
import {
    createTable, printUpdatedFiles,
    createJsonPath, createReqResPath, createJsonPathWhenPropertyWasModified
} from './terminal_helper.js'


let term = terminal.terminal;
let prompt = promptSync();

let updatedFiles = [];
let filesWithDiffs = [];
let missInMock = [];

let mockDir, realDir;


export let mockFiles, realFiles;
export let args = process.argv;


// make action names from deep-diff user friendly
let actionName = {
    "E": vConst.MODIFIED,    
    "N": vConst.ADDED,
    "D": vConst.DELETED,
    "A": vConst.ARRAY_CHANGED 
};


// do not show differences for the following keys:
let exceptKeys = [
    vConst.USER_AGENT, vConst.COOKIE, vConst.FANSIGHT_TAB,
    vConst.SEC_CH_UA, vConst.SEC_CH_UA_MOBILE, vConst.SEC_CH_UA_PLATFORM
];


/**
 * 
 * @param {*} ar is process.argv
 */
function argParse(ar) {
    for (let i=0; i<ar.length; i++) {

        if (["-h", "--help"].includes(ar[2])) {
            console.log(`usage: node ... [option] ... [option] ...

Options and arguments:
-mock   : path to folder containing mock data
-real   : path to folder containing real data`);

            process.exit();
        } 
        if (ar[i] == "-mock") {
            mockDir = ar[i+1];
        }
        if (ar[i] == "-real") {
            realDir = ar[i+1];
        }
        
    }
}


/**
 * raead files from mock and real data folders
 */
 function readFilesFromDirs() {
    try {
        mockFiles = fs.readdirSync(mockDir);
        realFiles = fs.readdirSync(realDir);
    } catch (err) {
        console.log(`One of the provided paths is invalid, please check their existence.
    path: ${err.path}`);
        process.exit();
    }
}


/**
 * add in list all files missing in mock data
 * @param {*} file files in real data
 */
function checkFileInMock(file) {
    if (!mockFiles.includes(file)) {
        missInMock.push(file)
    }
}


/**
 * 
 * @param {*} mf 
 * @param {*} rf 
 */
 function checkFilesWithDiffs(mf, rf) {
    let mockPath, mock, realPath, real;
    for (let i=0; i<rf.length; i++) {
        for (let j=0; j<mf.length; j++) {
            if (rf[i] === mf[j]) {
                mockPath = path.join(mockDir, mf[j]);
                try{
                    mock = JSON.parse(fs.readFileSync(mockPath));
                } catch (error) {
                    console.log(`\n${error.message} in ${mockPath}\n`);
                    process.exit();
                }

                realPath = path.join(realDir, rf[i]);
                try{
                    real = JSON.parse(fs.readFileSync(realPath));
                } catch (error) {
                    console.log(`\n${error.message} in ${realPath}\n`);
                    process.exit();
                }
                    
                let deepDiffs = diff.diff(mock, real);

                if (deepDiffs && !filesWithDiffs.includes(mf[j])) {
                    filesWithDiffs.push(mf[j]);
                }
            }
        }
    }
}


/**
 * 
 * @param {*} arr apis array of mock or real data
 * @param {*} conArr 
 */
function initConstructedArray(arr, conArr) {
    for (let i=0; i<arr.length; i++) {
        conArr.push({
            "api": {
                "url": arr[i].request.url,
                "method": arr[i].request.method
            },
            "diff": [],
            "request": [],
            "response": []
        })
    }
}


/**
 * 
 * @param {*} diffArr array result of deep-diff on mock and real data
 * @param {*} conArr 
 */
function constructArray(diffArr, conArr) {
    for (let i=0; i<diffArr.length; i++) {  
        // filter exception properties      
        if (! diffArr[i].path.some(e => exceptKeys.includes(e))) {

            if (diffArr[i].kind == "A") {
                conArr[diffArr[i].index].diff.push({
                    "action": actionName[diffArr[i].item.kind],
                    "path": diffArr[i].path,
                    "mock": diffArr[i].item.lhs,
                    "real": diffArr[i].item.rhs
                })
            } else {
                conArr[diffArr[i].path[1]].diff.push({
                    "action": actionName[diffArr[i].kind],
                    "path": createJsonPath(diffArr[i].path),
                    "mock": diffArr[i].lhs,
                    "real": diffArr[i].rhs
                });
            }

            createReqResPath(diffArr[i], conArr);          
        }
    } 
}


/**
 * 
 * @param {*} mock data
 * @param {*} real data
 * @param {*} diff is the result of diff.diff function on mock and real data
 * @returns new more readable array
 */
function constructDiffJson(mock, real, diff) {
    let apis;
    if(real.apis.length > mock.apis.length) {
        apis = real.apis;
    } else {
        apis = mock.apis;
    }

    let conJsonArr = [];
    initConstructedArray(apis, conJsonArr);
    constructArray(diff, conJsonArr);
    
    return conJsonArr;
}


/**
 *  
 * @param { 
 * } diffBody is the result of diff.diff function on mock and real data of a body
 * @returns new more readable array
 */
function constructDiffJsonBody(diffBody) {
    let diffArrBody = [];
    for (let i=0; i<diffBody.length; i++) {   
            diffArrBody.push({
                "action": actionName[diffBody[i].kind],
                "path": diffBody[i].path,
                "mock": diffBody[i].lhs,
                "real": diffBody[i].rhs
            });
        /* if action is changes within array and body has an item
        call the function recursively for an item */
        if ("item" in diffBody[i]) {
            let diffBodyItemArr = [];
            diffBodyItemArr.push(diffBody[i].item);
            // create json from body new item recursively
            let diffItem = constructDiffJsonBody(diffBodyItemArr);
            diffArrBody.push({"item": diffItem});
        }            
    } 
    return diffArrBody;
}


/**
 * creates tables for request, response and body
 * @param {*} arr is the diff[] property of array constructed from differences
 * containing "action", "path", "mock" and "real" properties
 */
function showDiffs(arr) {
    let head = [["ACTION", "PATH", "MOCK", "REAL"]];
    for (let j=0; j<arr.length; j++) {
        let bodyPath;
        if (arr[j].path.includes(".body")) {
            bodyPath = arr[j].path
        }
        // create json for body, if it exists in differences
        if (arr[j].path.includes(".body")) {
            /* if "kind": "D" / "Property was deleted"
            or if "kind": "N" / "Property was newly added"
            there is no lhs/rhs or mock/real */
            if (arr[j].action === vConst.DELETED 
            || arr[j].action === vConst.ADDED) {
                head.push(
                    [
                        arr[j].action,
                        arr[j].path,
                        " N/A ",
                        " N/A "
                    ]
                )
            } else {
                // find differences within body
                let differencesBody = diff.diff(JSON.parse(arr[j].mock), JSON.parse(arr[j].real));
                let diffBody = constructDiffJsonBody(differencesBody);

                if (diffBody.length) {
                    for (let i=0; i<diffBody.length; i++) {
                        //  if action type is "A": "Changes within an array" create a table from items
                        if (diffBody[i].action === vConst.ARRAY_CHANGED) { 
                            /* need new index z, because if action is "Changes within an array"
                            diffs are shown in the next element of an diffBody array
                            and need to step over one element ++i */                        
                            let z = ++i;                       
                            // iterate in item
                            for (let k=0; k<diffBody[z].item.length; k++) {
                                createJsonPathWhenPropertyWasModified(diffBody[z].item[k], head, bodyPath);
                            }
                        } else {
                            createJsonPathWhenPropertyWasModified(diffBody[i], head, bodyPath);
                        } 
                    } 
                }

            }
        } else {
            head.push([
                arr[j].action, 
                arr[j].path, 
                JSON.stringify(arr[j].mock), 
                JSON.stringify(arr[j].real)
            ]);
        }   
    }

    if (head.length) {
        createTable(head, 120);
    }
}


/**
 * 
 * @param {*} mock data
 * @param {*} real data
 * @param {*} apiId index of api call
 * @param {*} mockFile
 * @returns mock data, same or updated depends on user input
 */
function applyDiffs(mock, real, apiId, mockFile) {
    term.magenta(`For any action please choose the option:\n`) 
    console.log(`Y - Override mock data, N - Skip, no modifications`);

    let act = prompt();

    while (!(['y', 'Y', 'n', 'N'].includes(act))) {
        act = prompt(`Please choose from Y/N: `);
    }  

    switch (act) {
        case 'y': case 'Y':
            mock.apis[apiId] = real.apis[apiId];
            /* in case of mock data updated, add it to the list of updated files
            if it has not been added yet */
            if (!updatedFiles.includes(mockFile)) {
                updatedFiles.push(mockFile);
            }
            break;
        case 'n': case 'N':
            break;
    }

    return mock;
}


/**
 * uses showDiffs and applyDiffs functions depending on user input
 * @param {*} conJsonArr more readable array constructed from mock data
 * and result of diff.diff function on mock and real data
 * @param {*} mock mock data
 * @param {*} real real data
 * @returns mock data, with or without updating
 */
function showApplyDiffs(conJsonArr, mock, real, mockFile) {
    for (let i=0; i < conJsonArr.length; i++) {
        if (conJsonArr[i].diff.length) {
            term.green(`\nURL:    ${conJsonArr[i].api.url}\nMETHOD: ${conJsonArr[i].api.method}\n\n`);

            // create tables for request and response if they are not empty 
            if (conJsonArr[i].request.length) {
                let head1 = [["REQUEST"], [conJsonArr[i].request.join('\n')]];
                createTable(head1, 40);
            }

            if (conJsonArr[i].response.length) {
                let head2 = [["RESPONSE"], [conJsonArr[i].response.join('\n')]];
                createTable(head2, 40);
            }
            
            /* when the path is "apis", that means that the request is new or deleted,
            the diff array length is 1, as there can not be any other changes */
            if (conJsonArr[i].diff[0].path == "apis") {
                if (conJsonArr[i].diff[0].action == vConst.DELETED) {
                    term.brightWhite(`\nThe request is deleted.\n`);
                } else if (conJsonArr[i].diff[0].action == vConst.ADDED) {
                    term.brightWhite(`\nThe request is new.\n`);
                }
            }
            
            term.magenta('\nDo you want to see differences more detailed? [Y/N]\n');
            term.red("\nType (Q) for exit\n")

            let answer = prompt();

            while (!(["y", "Y", "n", "N", "q", "Q"].includes(answer))) {
                answer = prompt(`Please choose from Y/N/Q: `);
            }  

            switch (answer) {
                case "Y": case "y":
                    showDiffs(conJsonArr[i].diff);
                    break;
                case "Q": case "q":
                    return mock;
                    break;
            }

            /* prompts a user to apply differences, or save the old 
            values after showing either not showing differences */
            mock = applyDiffs(mock, real, i, mockFile);          
        }
    }
    return mock;
}


/**
 * 
 * @param {*} mockF mock data files
 * @param {*} realF files from real API request
 */
function fileHandling(mockF, realF) {

    term.yellow.bold(`\nWARNING: `);
    term.yellow(`PLEASE NOTE, THAT THE TOOL SKIPS VALIDATION FOR THE FOLLOWING KEY/VALUE CHANGES IN STORED API RESULTS: `);
    term.red(`${exceptKeys}\n`);

    for (let i=0; i<realF.length; i++) {
        for (let j=0; j<mockF.length; j++) {
            if (realF[i] === mockF[j]) {
                let mockPath = path.join(mockDir, mockF[j]);
                let mock = JSON.parse(fs.readFileSync(mockPath));

                let realPath = path.join(realDir, realF[i]);
                let real = JSON.parse(fs.readFileSync(realPath));              
    
                let deepDiffs = diff.diff(mock, real);
                
                if (deepDiffs) {
                    term.brightWhite(`\nDifferences for `);
                    term.brightBlue.bold(`${mockF[j]}`);
                    term.brightWhite(` MOCK DATA and real API requests\n`);
    
                    let conJson = constructDiffJson(mock, real, deepDiffs);
                    let updatedData = showApplyDiffs(conJson, mock, real, mockF[j]);

                    // delete null values, when reuest is deleted
                    updatedData.apis = updatedData.apis.filter(api => api != null);

                    // rewrite only mock data that has been modified
                    if (updatedFiles.includes(mockF[j])) {
                        fs.writeFileSync(mockPath, (JSON.stringify(updatedData, null, 4)));
                    }

                } else {
                    console.log("\n\n")
                    term.black.bgWhite(`Skipping `);
                    term.brightBlue.bold.bgWhite(`${mockF[j]}`);
                    term.black.bgWhite(`  MOCK DATA changes, as the mock/real API requests are the same`);
                    console.log("\n\n")
                }            
            }
        }
    }
}


/**
 * overwrite all data that have differences
 * @param {*} mf mock data
 * @param {*} rf real data
 */
function applyAllDiffs(mf, rf) {
    for (let i=0; i<rf.length; i++) {
        for (let j=0; j<mf.length; j++) {
            if (rf[i] === mf[j]) {
                let mockPath = path.join(mockDir, mf[j]);
                let mock = JSON.parse(fs.readFileSync(mockPath));

                let realPath = path.join(realDir, rf[i]);
                let real = JSON.parse(fs.readFileSync(realPath));              
    
                let deepDiffs = diff.diff(mock, real);

                if (deepDiffs) {
                    fs.writeFileSync(mockPath, (JSON.stringify(real, null, 4)));
                }
            }
        }
    }
}


/**
 * creates files in mock if exists in real files and missing in mock
 * @param {*} missFiles list of files in real files missing in mock files
 */
 function createMissingFiles(missFiles) {
    let realPath, mockPath, realData;
    for (let i=0; i<missFiles.length; i++) {
        realPath = path.join(realDir, missFiles[i]);
        mockPath = path.join(mockDir, missFiles[i]);
        try {
            realData = fs.readFileSync(realPath);
            fs.writeFileSync(mockPath, realData, null, 4);
        } catch (err) {
            console.log(err.message);
        }        
    }
}


/**
 * 
 * @returns 
 */
function previewMissingFiles() {
    if (!missInMock.length) {
        term.yellow(`\nThere is no missing mock data.\n`);
        return;
    }

    term.yellow(`\nThe following data is missing from mock files:`);
    for (let f=0; f<missInMock.length; f++) {
        term.brightBlue.bold(`\n${missInMock[f]}`);
    }
      
    console.log(`\n\nCreate missing data?:
    Y - Yes
    N - No
    `);

    let p = prompt();

    while (!(["y", "Y", "n", "N"].includes(p))) {
        p = prompt(`Please choose from Y/N: `);
    }

    switch(p) {
        case "y": case "Y":
            createMissingFiles(missInMock);
            break;
        case "n": case "N":
            break;
    }

}


/**
 * show mock data that have differences and depending on user input
 * overwrite all data, show and apply diffs or quit without changes
 * @param {*} mf mock files
 * @param {*} rf real files
 */
function previewFilesWithDiffs(mf, rf) {

    if (!filesWithDiffs.length) {
        term.yellow(`\nThere are no differences for mock data.\n\n`);
        return;
    }

    if (filesWithDiffs.length) {
        term.yellow(`\nThe following mock data have differences with real data:`)
        for (let f=0; f<filesWithDiffs.length; f++) {
            term.brightBlue.bold(`\n${filesWithDiffs[f]}`);
        }
    }

    console.log(`\n\nPlease choose from the options:
    S - show differences
    A - apply all differences
    Q - quit
    `);
    
    let p = prompt();

    while (!(["s", "S", "a", "A", "q", "Q"].includes(p))) {
        p = prompt(`Please choose from S/A/Q: `);
    }

    switch(p) {
        case "S": case "s":
            fileHandling(mf, rf);
            printUpdatedFiles(updatedFiles);
            break;
        case "A": case "a":
            applyAllDiffs(mf, rf);
            break;
        case "Q": case "q":
            break;
    }

}


export { argParse, readFilesFromDirs, checkFileInMock, checkFilesWithDiffs, previewMissingFiles, previewFilesWithDiffs };
