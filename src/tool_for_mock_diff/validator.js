import { 
    argParse,
    args, 
    readFilesFromDirs, 
    mockFiles, 
    realFiles, 
    checkFileInMock, 
    checkFilesWithDiffs, 
    previewMissingFiles, 
    previewFilesWithDiffs 
} from '../utils/validator_helper.js'
    

// parse process.argv arguments 
argParse(args);

// raead files from mock and real data folders
readFilesFromDirs();

// check existence of real data in mock data folder
realFiles.forEach(checkFileInMock);

// return an array of files with differences
checkFilesWithDiffs(mockFiles, realFiles);

// preview files missing in mock data folder
previewMissingFiles();

// preview files with differences
previewFilesWithDiffs(mockFiles, realFiles);
