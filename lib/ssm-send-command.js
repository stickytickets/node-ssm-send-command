var async = require('async');
var AWS = require('aws-sdk');
var ssm = new AWS.SSM();
var ec2 = new AWS.EC2();
var assert = require('assert');

module.exports = function(options, cb) {

    assert(typeof(options), 'object', "Options must be supplied");
    assert(typeof(options.documentName), 'string', "options.documentName must be supplied");
    assert(typeof(options.tagName), 'string', "options.tagName must be supplied");
    assert(typeof(options.tagValue), 'string', "options.tagValue must be supplied");

    var context = {};

    async.parallel([
            get_bucket_location(options, context),
            get_instances_to_run_command_on(options, context)
        ],
        function(err) {

            if (err) return cb(err);

            async.waterfall([
                run_command(options, context),
                wait_for_completion(options, context),
                print_results_to_console(options, context)
            ], cb);
        }
    );
}

function get_bucket_location(options, context) {
    return cb => {

        if (!options.outputS3BucketName) return cb();


        var s3 = new AWS.S3();
        var params = {
            Bucket: options.outputS3BucketName
        };

        s3.getBucketLocation(params, function(err, data) {
            if (err) {
              console.error('Error gettting bucket location: %j', params)
              return cb(err);
            }
            context.bucketLocation = data.LocationConstraint;
            cb();
        });

    };
}

function print_results_to_console(options, context) {

    return function(cb) {

        //download from s3
        setTimeout(function() {

            var ssmParams = {
                CommandId: context.commandId,
                Details: true
            };

            ssm.listCommandInvocations(ssmParams, function(err, data) {

                if (err) {
                    console.log('ssm:listCommandInvocations failed');
                    return cb(err);
                }

                if (!data.CommandInvocations) {
                    return cb('No commnand output returned');
                }

                var s3 = new AWS.S3({
                    'region': context.bucketLocation
                });

                var asyncParams = [];

                for (var x = 0; x < data.CommandInvocations.length; ++x) {
                    var commandInvocation = data.CommandInvocations[x];

                    console.log('Instance: ' + commandInvocation.InstanceId);

                    if (options.outputS3BucketName) {
                        console.log('Log will be downloaded from S3..');
                    } else {
                        console.log('Only 2500 characters of the output is shown. If you log output to an S3 bucket, the full output will be downloaded an shown');
                        console.log(commandInvocation.TraceOutput);
                    }

                    console.log(commandInvocation)

                    for (var y = 0; y < commandInvocation.CommandPlugins.length; ++y) {
                        var commandPlugin = commandInvocation.CommandPlugins[y];

                        if (!options.outputS3BucketName) {
                            console.log('Output for: ' + commandPlugin.Name);
                            console.log(commandPlugin.Output);
                        } else {
                            console.log(commandPlugin)
                            asyncParams.push({
                                s3Param: {
                                    Bucket: commandPlugin.OutputS3BucketName,
                                    Key: commandPlugin.OutputS3KeyPrefix + '/stdout.txt'
                                },
                                instanceId: commandInvocation.InstanceId
                            });
                        }
                    }
                }

                cb();
            });
        }, 3000)
    }
}

function wait_for_completion(options, context) {

    return function(cb) {

        var maxChecks = 10; //Should be set to command timeout property
        var checks = 0;
        var checkingStarted = false;
        console.log("Query command status using ID, and call back one completed. (pass an error if command doesn't run succesfully) ");

        var ssmParams = {
            CommandId: context.commandId
        };

        var interval = setInterval(function() {

            var currentStatus;
            if (!checkingStarted) {
                checkingStarted = true;

                ssm.listCommands(ssmParams, function(err, data) {

                    if (err) {
                        console.log('ssm:listCommands failed');
                        return cb(err);
                    }

                    checks = checks + 1;

                    currentStatus = data.Commands[0].Status;

                    console.log(`${currentStatus} (id: ${context.commandId}) `);
                    if (currentStatus !== "Success" && currentStatus !== "InProgress" && currentStatus !== "Pending") {
                        clearInterval(interval);
                        return cb("Error executing command. Status: " + currentStatus);
                    }

                    if (checks > 400 || (currentStatus == "Success")) {
                        console.log(`Done, Checks: ${checks} command status: ${currentStatus} (CommandID: ${context.commandId}) `);
                        clearInterval(interval);
                        return cb();
                    }
                    checkingStarted = false;
                });
            }

        }, 10000);
    };
}

function run_command(options, context) {

    return function(cb) {

        var instanceIds = [];

        for (var i = 0; i < context.instances.length; i++) {
            instanceIds.push(context.instances[i].InstanceId);
        }

        var params = {
            DocumentName: options.documentName,
            InstanceIds: instanceIds,
            Parameters: options.parameters,
            Comment: options.comment,
            TimeoutSeconds: options.timeoutSeconds,
            OutputS3BucketName: options.outputS3BucketName,
            OutputS3KeyPrefix: options.outputS3BucketName ? options.outputS3KeyPrefix || "run-command" : null
        };

        console.log('Sending Command: %j', params);

        ssm.sendCommand(params, function(err, data) {

            if (err) {
                console.error('ssm:sendCommand failed');
                return cb(err);
            }

            context.commandId = data.Command.CommandId;
            return cb();
        });
    }
}

function get_instances_to_run_command_on(options, context) {

    return function(cb) {

        var params = {
            Filters: [
              {
                  Name: 'instance-state-name',
                  Values: ['running'] // context.instanceStaAppsTagValues.split(',')
              },
              {
                Name: 'tag-key',
                Values: [options.tagName]
            }]
        };

        ec2.describeInstances(params, function(err, data) {

            if (err) {
                console.error('ec2:describeInstances failed');
                return cb(err);

            }

            if (!data.Reservations) {
                return cb('No Reservations returned');
            }

            var instances = [];
            for (var i = 0; i < data.Reservations.length; ++i) {
                for (var x = 0; x < data.Reservations[i].Instances.length; ++x) {

                    var tags = data.Reservations[i].Instances[x].Tags;

                    for (var t = 0; t < tags.length; t++) {
                        if (tags[t].Key === options.tagName) {
                            var regex = new RegExp(options.tagValue);
                            var result = regex.test(tags[t].Value);

                            console.log(`Test: ${tags[t].Value} Regex: ${options.tagValue} is: ${result}`);

                            if (result) {
                                instances.push(data.Reservations[i].Instances[x]);
                            }

                        }
                    }
                }
            }

            context.instances = instances;

            if (context.instances.length == 0) cb(`No instances with matching tag found. Tag: ${options.tagName} Matching: ${options.tagValue}`);

            return cb();
        });
    };
}
