/* See also:
    http://www.html5rocks.com/en/tutorials/webrtc/basics/
    https://code.google.com/p/webrtc-samples/source/browse/trunk/apprtc/index.html

    https://webrtc-demos.appspot.com/html/pc1.html
*/

var cfg = {"iceServers":[{"url":"stun:23.21.150.121"}]},
    con = { 'optional': [{'DtlsSrtpKeyAgreement': true}] };

/* THIS IS ALICE, THE CALLER/SENDER */

var pc1 = new RTCPeerConnection(cfg, con),
    dc1 = null, tn1 = null;

// Since the same JS file contains code for both sides of the connection,
// activedc tracks which of the two possible datachannel variables we're using.
var activedc;

var pc1icedone = false;

var qrFlow;

$('#showLocalOffer').modal('hide');
$('#getRemoteAnswer').modal('hide');
$('#waitForConnection').modal('hide');
$('#qrFlow').modal('hide');
$('#createOrJoin').modal('show');

$('#createBtn').click(function() {
    if ($('#using-camera').prop('checked')) {
        qrFlow = new QRFlow(true);
    } else {
        $('#showLocalOffer').modal('show');
    }
    createLocalOffer();
});

$('#joinBtn').click(function() {
    if ($('#using-camera').prop('checked')) {
        qrFlow = new QRFlow(false);
    } else {
        $('#getRemoteOffer').modal('show');
    }
});

$('#offerSentBtn').click(function() {
    $('#getRemoteAnswer').modal('show');
});

function handleJsonOfferFromPC1(offer) {
    var offerDesc = new RTCSessionDescription(JSON.parse(offer));
    handleOfferFromPC1(offerDesc);
}

$('#offerRecdBtn').click(function() {
    var offer = $('#remoteOffer').val();
    handleJsonOfferFromPC1(offer);
    $('#showLocalAnswer').modal('show');
});

$('#answerSentBtn').click(function() {
    $('#waitForConnection').modal('show');
});

function handleJsonAnswerFromPC2(answer) {
    var answerDesc = new RTCSessionDescription(JSON.parse(answer));
    handleAnswerFromPC2(answerDesc);
}

$('#answerRecdBtn').click(function() {
    var answer = $('#remoteAnswer').val();
    handleJsonAnswerFromPC2(answer);
    $('#waitForConnection').modal('show');
});

$('#fileBtn').change(function() {
    var file = this.files[0];
    console.log(file);

    sendFile(file);
});

function fileSent(file) {
    console.log(file + " sent");
}

function fileProgress(file) {
    console.log(file + " progress");
}

function sendFile(data) {
    if (data.size) {
        FileSender.send({
          file: data,
          onFileSent: fileSent,
          onFileProgress: fileProgress,
        });
    }
}

function sendMessage() {
    if ($('#messageTextBox').val()) {
        var channel = new RTCMultiSession();
        writeToChatLog($('#messageTextBox').val(), "text-success");
        channel.send({message: $('#messageTextBox').val()});
        $('#messageTextBox').val("");

        // Scroll chat text area to the bottom on new input.
        $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
    }

    return false;
};

function setupDC1() {
    try {
        var fileReceiver1 = new FileReceiver();
        dc1 = pc1.createDataChannel('test', {reliable:true});
        activedc = dc1;
        console.log("Created datachannel (pc1)");
        dc1.onopen = function (e) {
            console.log('data channel connect');
            $('#waitForConnection').modal('hide');
            $('#waitForConnection').remove();
            if (qrFlow) {
                qrFlow.remove();
            }
        }
        dc1.onmessage = function (e) {
            console.log("Got message (pc1)", e.data);
            if (e.data.size) {
                fileReceiver1.receive(e.data, {});
            }
            else {
                if (e.data.charCodeAt(0) == 2) {
                   // The first message we get from Firefox (but not Chrome)
                   // is literal ASCII 2 and I don't understand why -- if we
                   // leave it in, JSON.parse() will barf.
                   return;
                }
                console.log(e);
                var data = JSON.parse(e.data);
                if (data.type === 'file') {
                    fileReceiver1.receive(e.data, {});
                }
                else {
                    writeToChatLog(data.message, "text-info");
                    // Scroll chat text area to the bottom on new input.
                    $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
                }
            }
        };
    } catch (e) { console.warn("No data channel (pc1)", e); }
}

function createLocalOffer() {
    setupDC1();
    pc1.createOffer(function (desc) {
        pc1.setLocalDescription(desc, function () {});
        console.log("created local offer", desc);
    }, function () {console.warn("Couldn't create offer");});
}

pc1.onicecandidate = function (e) {
    console.log("ICE candidate (pc1)", e);
    if (e.candidate == null) {
        var s = JSON.stringify(pc1.localDescription);
        if (qrFlow) {
            qrFlow.showQRCodes(s);
        } else {
            $('#localOffer').html(s);
        }
    }
};

function handleOnconnection() {
    console.log("Datachannel connected");
    writeToChatLog("Datachannel connected", "text-success");
    $('#waitForConnection').modal('hide');
    // If we didn't call remove() here, there would be a race on pc2:
    //   - first onconnection() hides the dialog, then someone clicks
    //     on answerSentBtn which shows it, and it stays shown forever.
    $('#waitForConnection').remove();
    if (qrFlow) {
        qrFlow.remove();
    }
    $('#showLocalAnswer').modal('hide');
    $('#messageTextBox').focus();
}

pc1.onconnection = handleOnconnection;

function onsignalingstatechange(state) {
    console.info('signaling state change:', state);
}

function oniceconnectionstatechange(state) {
    console.info('ice connection state change:', state);
}

function onicegatheringstatechange(state) {
    console.info('ice gathering state change:', state);
}

pc1.onsignalingstatechange = onsignalingstatechange;
pc1.oniceconnectionstatechange = oniceconnectionstatechange;
pc1.onicegatheringstatechange = onicegatheringstatechange;

function handleAnswerFromPC2(answerDesc) {
    console.log("Received remote answer: ", answerDesc);
    writeToChatLog("Received remote answer", "text-success");
    pc1.setRemoteDescription(answerDesc);
}


/* THIS IS BOB, THE ANSWERER/RECEIVER */

var pc2 = new RTCPeerConnection(cfg, con),
    dc2 = null;

var pc2icedone = false;

pc2.ondatachannel = function (e) {
    var fileReceiver2 = new FileReceiver();
    var datachannel = e.channel || e; // Chrome sends event, FF sends raw channel
    console.log("Received datachannel (pc2)", arguments);
    dc2 = datachannel;
    activedc = dc2;
    dc2.onopen = function (e) {
        console.log('data channel connect');
        $('#waitForConnection').remove();
        if (qrFlow) {
            qrFlow.remove();
        }
    }
    dc2.onmessage = function (e) {
        console.log("Got message (pc2)", e.data);
        if (e.data.size) {
            fileReceiver2.receive(e.data, {});
        }
        else {
            var data = JSON.parse(e.data);
            if (data.type === 'file') {
                fileReceiver2.receive(e.data, {});
            }
            else {
                writeToChatLog(data.message, "text-info");
                // Scroll chat text area to the bottom on new input.
                $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
            }
        }
    };
};

function handleOfferFromPC1(offerDesc) {
    console.log("Received remote offer", offerDesc);
    writeToChatLog("Received remote offer", "text-success");
    pc2.setRemoteDescription(offerDesc);
    pc2.createAnswer(function (answerDesc) {
        writeToChatLog("Created local answer", "text-success");
        console.log("Created local answer: ", answerDesc);
        pc2.setLocalDescription(answerDesc);
    }, function () { console.warn("No create answer"); });
}

pc2.onicecandidate = function (e) {
    console.log("ICE candidate (pc2)", e);
    if (e.candidate == null) {
        var s = JSON.stringify(pc2.localDescription);
        if (qrFlow) {
            qrFlow.showQRCodes(s);
        } else {
            $('#localAnswer').html(s);
        }
    }
};

pc2.onsignalingstatechange = onsignalingstatechange;
pc2.oniceconnectionstatechange = oniceconnectionstatechange;
pc2.onicegatheringstatechange = onicegatheringstatechange;

pc2.onaddstream = function (e) {
    console.log("Got remote stream", e);
    var el = new Audio();
    el.autoplay = true;
    attachMediaStream(el, e.stream);
};

pc2.onconnection = handleOnconnection;

function getTimestamp() {
    var totalSec = new Date().getTime() / 1000;
    var hours = parseInt(totalSec / 3600) % 24;
    var minutes = parseInt(totalSec / 60) % 60;
    var seconds = parseInt(totalSec % 60);

    var result = (hours < 10 ? "0" + hours : hours) + ":" +
                 (minutes < 10 ? "0" + minutes : minutes) + ":" +
                 (seconds  < 10 ? "0" + seconds : seconds);

    return result;
}

function writeToChatLog(message, message_type) {
    document.getElementById('chatlog').innerHTML += '<p class=\"' + message_type + '\">' + "[" + getTimestamp() + "] " + message + '</p>';
}


function QRFlow(isOfferer) {
    var cameraSelect = $('<select>')
        .on('change', function() {
            stopCamera();
            startCamera();
        });

    // TODO: firefox doesn't support media stream track
    MediaStreamTrack.getSources(function(sources) {
        for (var i = 0; i < sources.length; i++) {
            if (sources[i].kind === 'video') {
                cameraSelect.append(
                    $('<option>')
                        .attr('value', sources[i].id)
                        .text(sources[i].label)
                );
            }
        }
    });

    var cameraCanvas = $('<canvas>')
        .attr('id', 'qr-canvas') // this id is required for the jsqrcode lib
        .css({
            width: '256px'
        });

    var cameraProgress = $('<div>');

    var cameraContainer = $('<div>')
        .text(isOfferer ? 'After the other device receives our offer, use this camera to scan their answer:'
                        : 'Use this camera to scan the offer from the other device:')
        .append('<br>')
        .append('Select camera:')
        .append(cameraSelect)
        .append('<br>')
        .append(cameraCanvas)
        .append(cameraProgress);

    // If this is the offerer, createLocalOffer is called shortly afterwards to fill this with the qr code
    var qrCodeContainer = $('<div>').text(isOfferer ? 'Generating offer.' : '');

    var modal = $('#qrFlow');
    if (isOfferer) {
        // Send offer with QR code first, then get answer with camera
        modal.find('.modal-body').append(qrCodeContainer).append(cameraContainer).append(video);
    } else {
        // Scan offer with camera first, then send answer with qr codes
        modal.find('.modal-body').append(cameraContainer).append(qrCodeContainer).append(video);
    }

    // Start off hidden until video permissions are accepted and camera started
    modal.find('.modal-body').hide();
    modal.modal('show');

    // Need a dummy <video> to attach the webcam stream to but we'll manually copy frames into cameraCanvas
    var video = $('<video autoplay>').hide().appendTo('body');

    startCamera();


    var payloadSize = 400;
    function encodeQRText(offset, compressedMessage) {
        // The compressedMessage does fit in a single QR code but it's huge and hard to scan
        // So we need to split them into smaller chunks
        var payload = compressedMessage.substr(offset, payloadSize);
        var qrText = ',' + offset + ',' + compressedMessage.length + ',' + payload;
        // QR codes already have built in error detection/correction but I am still seeing errors
        // Add a simple checksum to help with that
        var checksum = 0;
        for (var i = 0; i < qrText.length; i++) {
            checksum += qrText.charCodeAt(i);
        }
        qrText = (checksum % 256) + qrText;
        return qrText;
    }

    function decodeQRText(qrText) {
        var split = qrText.split(',', 3);
        if (split.length != 3) {
            throw 'invalid format';
        }

        var checksum = parseInt(split[0]);
        var offset = parseInt(split[1]);
        var totalSize = parseInt(split[2]);
        var payload = qrText.substr(split[0].length + 1 + split[1].length + 1 + split[2].length + 1);

        // Check that parseInt succeeded
        if (isNaN(checksum) || isNaN(offset) || isNaN(totalSize)) {
            throw 'invalid format';
        }

        // Check checksum
        var expectedCheckSum = 0;
        for (var i = split[0].length; i < qrText.length; i++) {
            expectedCheckSum += qrText.charCodeAt(i);
        }
        expectedCheckSum %= 256;
        if (expectedCheckSum != checksum) {
            throw 'invalid checksum ' + checksum + ' ' + expectedCheckSum;
        }

        // Check payload length
        var expectedPayloadLength = Math.min(payloadSize, totalSize - offset);
        if (payload.length != expectedPayloadLength) {
            throw 'invalid payload length ' + payload.length + ' ' + expectedPayloadLength;
        }

        return {
            offset: offset,
            totalSize: totalSize,
            payload: payload,
        }
    }

    var sendLoop;
    function showQRCodes(message) {
        var compressedMessage = LZString.compressToBase64(message);

        var numQRCodes = Math.ceil(compressedMessage.length / payloadSize);

        var label = $('<div>').text('1 of ' + numQRCodes);

        var qrCodes = $('<div>');
        for (var offset = 0; offset < compressedMessage.length; offset += payloadSize) {
            qrCodes.append(
                $('<div>')
                    .css({
                        padding: '5px 0'
                    })
                    .qrcode({
                        text: encodeQRText(offset, compressedMessage),
                        correctLevel: 1, // QRErrorCorrectLevel.L
                    })
                    .hide()
            );
        }
        qrCodes.children(':first').show();

        // Rapidly flash a bunch of qr codes
        var rotate = function(delta) {
            var currVisible = qrCodes.children(':visible');
            currVisible.hide();
            var nextIndex = (currVisible.index() + delta + numQRCodes) % numQRCodes;
            label.text((nextIndex + 1) + ' of ' + numQRCodes);
            qrCodes.children(':eq(' + nextIndex + ')').show();
        }
        clearInterval(sendLoop);
        sendLoop = setInterval(function() {
            rotate(1);
        }, 100);

        qrCodeContainer
            .text("Here's your " + (isOfferer ? 'offer' : 'answer') + ". Send this by scanning with the other device's camera.")
            .append(label)
            .append(qrCodes)
            .append(
                $('<button class="btn">Previous block</button>')
                    .on('click', function() {
                        clearInterval(sendLoop);
                        rotate(-1);
                    })
            )
            .append(
                $('<button class="btn">Next block</button>')
                    .css('margin-left', '50px')
                    .on('click', function() {
                        clearInterval(sendLoop);
                        rotate(1);
                    })
            );
    }

    var blocks;
    var blocksReceived;
    var expectedMessageSize;
    function receiveQRCode(s, callbackIfCompleted) {
        console.log(s);

        var message = decodeQRText(s);
        var blockIndex = message.offset / payloadSize;
        var numBlocks = Math.ceil(message.totalSize / payloadSize);

        // First block ever received
        if (!blocks) {
            blocks = new Array(numBlocks);
            blocksReceived = 0;
            expectedMessageSize = message.totalSize;

            if (isOfferer) {
                // Since we got an answer, we know other device is not scanning our qr code anymore
                qrCodeContainer.hide();
            }

            // Draw a progress bar to show which blocks were received
            var progressBar = $('<div>').css({
                position: 'relative',
                height: '20px',
            });
            for (var i = 0; i < numBlocks; i++) {
                progressBar.append(
                    $('<div>')
                        .addClass('progress-tick')
                        .css({
                            'position': 'absolute',
                            'top': '0',
                            'left': (i * 100 / numBlocks) + '%',
                            'width': (100 / numBlocks) + '%',
                            'height': '100%',
                            'text-align': 'center',
                        })
                        .attr('title', i + 1)
                        .text('Block ' + (i + 1))
                );
            }
            cameraProgress
                .text('Receiving ' + (isOfferer ? 'answer' : 'offer') + '. Blocks received:')
                .append(progressBar);
        } else {
            // Check that the expected size is consistent with previous blocks
            if (message.totalSize != expectedMessageSize) {
                throw 'inconsistent size ' + message.totalSize + ' ' + expectedMessageSize;
            }
        }

        // First time receiving this block
        if (blocks[blockIndex] === undefined) {
            blocks[blockIndex] = message.payload;
            blocksReceived++;
            cameraProgress.find('.progress-tick:eq(' + blockIndex + ')')
                .css('background-color', 'black');

            // If received everything, call callback
            if (blocksReceived === numBlocks) {
                var fullMessage = LZString.decompressFromBase64(blocks.join(''));
                callbackIfCompleted(fullMessage);
            }
        }
    }

    var localMediaStream;
    var receiveLoop;
    function startCamera() {
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        window.URL = window.URL || window.webkitURL;
        navigator.getUserMedia({
            video: {
                optional: [{sourceId: cameraSelect.val()}]
            }
        }, function (stream) {
            if (!modal.find('.modal-body').is(':visible')) {
                modal.find('.modal-header h3').text(isOfferer ? 'Send offer / get answer' :
                                                                'Get offer / send answer');
                modal.find('.modal-body').show();
            }

            localMediaStream = stream;
            video[0].src = window.URL.createObjectURL(stream);
            video[0].onloadedmetadata = function(e) {
                cameraCanvas[0].width = video.width();
                cameraCanvas[0].height = video.height();
                receiveLoop = setInterval(function() {
                    // Draw current frame
                    cameraCanvas[0].getContext('2d').drawImage(video[0], 0, 0);

                    // Try to look for a QR code
                    qrcode.callback = function(s) {
                        receiveQRCode(s, function(message) {
                            if (isOfferer) {
                                handleJsonAnswerFromPC2(message);
                                stopCamera();
                                cameraContainer.hide().after("Received answer. If this whole thing doesn't disappear in a few seconds it probably failed to connect!");
                            } else {
                                handleJsonOfferFromPC1(message);
                                stopCamera();
                                cameraContainer.hide().after('Received offer.<br>');
                                qrCodeContainer.text('Generating answer.');
                            }
                        });
                    }
                    qrcode.decode();
                }, 33);
            }
        }, function (e) {
            console.log("getUserMediaError", e);
        });
    }

    function stopCamera() {
        clearInterval(receiveLoop);
        video[0].src = null;
        if (localMediaStream && localMediaStream.stop) {
            localMediaStream.stop();
        }
    }

    function remove() {
        clearInterval(sendLoop);
        stopCamera();
        modal.modal('hide');
    }

    this.showQRCodes = showQRCodes;
    this.remove = remove;
}
