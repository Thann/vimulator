ESC = '\u001B';
RETURN = '\u000D';
BACKSPACE = '\u0008';

function pressKeys(keys) {
    function keyEvent(type, key) {
        var event = document.createEvent('Event');
        event.initEvent(type, true, true);
        event.keyCode = key.charCodeAt(0);
        event.which = key.charCodeAt(0);
        return event;
    }

    jQuery.each(keys.split(''), function (i, key) {
        window.dispatchEvent(keyEvent('keydown', key));
        window.dispatchEvent(keyEvent('keypress', key));
        window.dispatchEvent(keyEvent('keyup', key));
    });
}

function pressEscape() {
    pressKeys(ESC);
}

function reset(text) {
    $(window).unbind('keydown')
             .unbind('keypress')
             .unbind('keyup');
    $('#vimulator pre').text(text);
    window.vimulator = new Vimulator.Base().init('#vimulator');
}

function currentText() {
    return $('#vimulator pre').text();
}

function commandLineText() {
    var commandLine = $('#vimulator p.command-line');
    if (commandLine.html() === '&nbsp;') {
        return '';
    } else {
        return commandLine.text();
    }
}

function cursorPosition() {
    var lines, row, col;

    lines = $('#vimulator pre').html().split('\n');
    for (row = 0; row < lines.length; row += 1) {
        col = lines[row].indexOf('<mark class="cursor">');
        if (col !== -1) {
            return {row: row, col: col};
        }
    }
}

function mockArgument(options) {
    var arg;
    options = options || {};
    arg = jasmine.createSpyObj("argument", ["keyPress", "complete", "value"]);
    arg.complete.andReturn(!!options.complete);
    arg.value.andReturn(options.value || null);
    return arg;
}

function mockCommand(options) {
    var cmd;
    options = options || {};
    cmd = jasmine.createSpyObj("command", ["buildArgument", "description",
        "execute"]);
    cmd.buildArgument.andReturn(options.argument || mockArgument());
    cmd.description.andReturn(options.description);
    return cmd;
}
