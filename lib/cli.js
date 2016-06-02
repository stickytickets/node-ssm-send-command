var yargs = require('yargs');
var ssmSendCommand = require('./ssm-send-command');

exports.run = function(args) {


    var argSetup = yargs(args);

    var argv = argSetup
        .option('document-name', {
            demand: true,
            describe: 'The command name',
            type: 'string'
        })
        .option('tag-name', {
            demand: true,
            describe: 'Run on instances with this tag name',
            type: 'string'
        })
        .option('tag-value', {
            demand: true,
            describe: 'Run on instances with this tag value',
            type: 'string'
        })
        .option('document-hash', {
            describe: 'The Sha256 hash created by the system when the document was created.',
            type: 'string'
        })
        .option('timeout-seconds', {
            describe: 'If this time is reached and the command has not already started executing, it will not execute.',
            type: 'string'
        })
        .option('comment', {
            describe: 'User-specified information about the command, such as a brief description of what the command should',
            type: 'string'
        })
        .option('output-s3-bucket-name', {
            describe: 'The name of the S3 bucket where command execution responses should be stored',
            type: 'string'
        })
        .option('output-s3-key-prefix', {
            describe: 'The directory structure within the S3 bucket where the responses should be stored.',
            type: 'string'
        }).argv;

        var parameters = Object.assign({} , argv);

        delete parameters['_'];
        delete parameters['$0'];

        delete parameters['document-name'];
        delete parameters['documentName'];

        delete parameters['tag-name'];
        delete parameters['tagName'];

        delete parameters['tag-value'];
        delete parameters['tagValue'];

        delete parameters['document-hash'];
        delete parameters['documentHash'];

        delete parameters['timeout-seconds'];
        delete parameters['timeoutSeconds'];

        delete parameters['comment'];

        delete parameters['output-s3-bucket-name'];
        delete parameters['outputS3BucketName'];

        delete parameters['output-s3-key-prefix'];
        delete parameters['outputS3KeyPrefix'];

        var paramsValuesAsArray = {};

        for(var key in parameters){
          paramsValuesAsArray[key] = [  parameters[key] ];
        }


        var options = Object.assign({parameters: paramsValuesAsArray} , argv);

        ssmSendCommand(options, e => {
            console.log('Done');
            console.log(e);
            if(e)
            {
              console.log(e);
              throw e;
            }
        });
}
