
// Vimulator - build-091220150100 

// base.js
(function () {
    window.Vimulator = {};

    Vimulator.Base = function () {};

    Vimulator.Base.prototype.init = function (container, options) {
        var vim, rendererConstructor;

        vim = this;

        options = options || {};

        this.modes = {
            normal: new Vimulator.NormalMode(this),
            insert: new Vimulator.InsertMode(this)
        };

        this.search = new Vimulator.Search(this);

        rendererConstructor = options.renderer || Vimulator.Renderer;
        this.renderer = new rendererConstructor().init(container);
        this.renderer.bindKeyListener(function (code) {
            vim.keyPress(code);
        });

        this.setMode("normal");
        this.cursor = {row: 0, col: 0};
        this.lines = this.renderer.readTextContainer();
        this.registers = {};
        this.marks = {};

        this.render();

        return this;
    };

    Vimulator.Base.prototype.setMode = function (name, argsForMode) {
        var args;

        this.mode = this.modes[name];
        if (!this.mode) {
            throw new Error("Illegal mode");
        }

        args = Array.prototype.slice.call(arguments, 1);
        this.mode.enter.apply(this.mode, args);
    };

    Vimulator.Base.prototype.keyPress = function (code) {
        var chr, op;

        chr = String.fromCharCode(code);
        op = this.mode.keyPress(chr);

        if (op && op.repeatable()) {
            this.lastEdit = op;
        }

        this.render(op);
    };

    Vimulator.Base.prototype.render = function (op) {
        this.renderer.renderText(this.lines, this.cursor);
        this.renderer.renderMode(this.mode.name);
        if (op) {
            this.renderer.renderOperation(op, this);
            this.renderer.renderCommandLine(op.commandLineText());
        } else {
            this.renderer.renderCommandLine();
        }
    };

    Vimulator.Base.prototype.repeatLastEdit = function () {
        var i, chr, lastInsert;

        if (!this.lastEdit) {
            return;
        }

        lastInsert = this.registers['.'];
        this.lastEdit.execute(this);
        if (this.mode.name === "insert") {
            for (i = 0; i < lastInsert.length; i++) {
                this.keyPress(lastInsert.charCodeAt(i));
            }
            this.setMode("normal");
            this.moveCursorRelative(0, -1);
        }
    };

    Vimulator.Base.prototype.moveCursorRow = function (row) {
        if (!row && row !== 0) {
            return;
        }
        this.cursor.row = row;
        if (row === '$' || this.cursor.row >= this.lines.length) {
            this.cursor.row = this.lines.length - 1;
        }
        if (this.cursor.row < 0) {
            this.cursor.row = 0;
        }
    };
    Vimulator.Base.prototype.moveCursorCol = function (col) {
        var line;

        if (!col && col !== 0) {
            return;
        }

        line = this.currentLine() || '';
        this.cursor.col = col;
        if (col === '$' || this.cursor.col >= line.length) {
            this.cursor.col = line.length - 1;
        }
        if (col === '^') {
            this.cursor.col = line.search(/[^\s]/);
        }
        if (this.cursor.col < 0) {
            this.cursor.col = 0;
        }
    };
    Vimulator.Base.prototype.moveCursor = function(row, col) {
        if (row && typeof row === 'object') {
            col = row.col;
            row = row.row;
        }
        this.moveCursorRow(row);
        this.moveCursorCol(col);
    };
    Vimulator.Base.prototype.moveCursorRelative = function(rows, cols) {
        var row, col;
        if (typeof rows === 'string') {
            row = rows;
        } else {
            row = this.cursor.row + rows;
        }
        if (typeof cols === 'string') {
            col = cols;
        } else {
            col = this.cursor.col + cols;
        }
        return this.moveCursor(row, col);
    };

    Vimulator.Base.prototype.currentLine = function () {
        return this.lines[this.cursor.row];
    };

    Vimulator.Base.prototype.appendChr = function (chr) {
        var line;

        if (chr === Vimulator.Utils.Keys.BACKSPACE) {
            this.removeChr();
        } else {
            line = this.currentLine();
            this.lines[this.cursor.row] =
                    line.substr(0, this.cursor.col) +
                    chr +
                    line.substr(this.cursor.col);
            this.cursor.col += 1;
        }
    };

    Vimulator.Base.prototype.removeChr = function () {
        var line = this.currentLine();

        if (this.cursor.col === 0 && this.cursor.row > 0) {
            this.moveCursorRelative(-1, '$');
            this.cursor.col += 1; //FIXME
            this.lines[this.cursor.row] += line;
            this.removeRows(this.cursor.row + 1, this.cursor.row + 2);
        } else if (this.cursor.col > 0) {
            this.lines[this.cursor.row] =
                    line.substr(0, this.cursor.col - 1) +
                    line.substr(this.cursor.col);
            this.cursor.col -= 1;
        }
    };

    Vimulator.Base.prototype.insertRowBelow = function (text, index) {
        var newLines, i;
        index = index || this.cursor.row;
        newLines = text.split('\n');
        for (i = newLines.length - 1; i >= 0; i -= 1) {
            this.lines.splice(index + 1, 0, newLines[i]);
        }
    };
    Vimulator.Base.prototype.insertRowAbove = function (text, index) {
        index = index || this.cursor.row;
        this.insertRowBelow(text, index - 1);
    };
    Vimulator.Base.prototype.replaceRow = function (text, index) {
        index = (typeof index === "undefined" ? this.cursor.row : index);
        this.lines[index] = text;
    };
    Vimulator.Base.prototype.removeRows = function (start, end) {
        this.lines.splice(start, end - start);
    };

    Vimulator.Base.prototype.removeRange = function(start, end) {
        if (start.row > end.row || start.row == end.row && start.col > end.col) {
            return this.removeRange(end, start);
        }

        this.lines[start.row] = 
                this.lines[start.row].substr(0, start.col) +
                this.lines[end.row].substr(end.col);

        this.lines.splice(start.row + 1, end.row - start.row);
        this.moveCursor(start);
    };

    Vimulator.Base.prototype.findNext = function (target, options) {
        var row, col, startCol;

        options = options || {};
        options.offset = options.offset || 0;
        options.from = options.from || this.cursor;

        startCol = options.from.col;
        if (!options.inclusive) {
            startCol += 1;
        }

        row = options.from.row;
        col = this.lines[row].indexOf(target, startCol);

        while (options.wrap && row < this.lines.length - 1 && col === -1) {
            row += 1;
            col = this.lines[row].indexOf(target);
        }

        if (options.loop && col === -1) {
            row = -1;
            while (row < options.from.row && col === -1) {
                row += 1;
                col = this.lines[row].indexOf(target);
            }
        }

        if (col === -1) {
            return {found: false};
        }

        col += options.offset;
        while (col >= this.lines[row].length) {
            if (options.wrap && row < this.lines.length - 1) {
                col -= this.lines[row].length;
                row += 1;
            } else {
                col = this.lines[row].length - 1;
            }
        }

        if (options.count && options.count > 1) {
            options.count -= 1;
            options.from = {row: row, col: col};
            options.inclusive = false;
            return this.findNext(target, options);
        } else {
            return {row: row, col: col, found: true};
        }
    };

    Vimulator.Base.prototype.moveToNext = function (target, options) {
        var position = this.findNext(target, options);
        this.moveCursor(position);
        return position.found;
    };

    Vimulator.Base.prototype.findLast = function (target, options) {
        var row, col, startCol;

        options = options || {};
        options.offset = options.offset || 0;
        options.from = options.from || this.cursor;

        startCol = options.from.col;
        if (!options.inclusive) {
            startCol -= 1;
        }

        row = options.from.row;
        col = this.lines[row].lastIndexOf(target, startCol);

        while (options.wrap && row > 0 && col === -1) {
            row -= 1;
            col = this.lines[row].lastIndexOf(target);
        }

        if (options.loop && col === -1) {
            row = this.lines.length;
            while (row > options.from.row && col === -1) {
                row -= 1;
                col = this.lines[row].lastIndexOf(target);
            }
        }

        if (col === -1) {
            return {found: false};
        }

        col += options.offset;
        while (col < 0) {
            if (options.wrap && row > 0) {
                col += this.lines[row].length - 1;
                row -= 1;
            } else {
                col = 0;
            }
        }

        if (options.count && options.count > 1) {
            options.count -= 1;
            options.from = {row: row, col: col};
            options.inclusive = false;
            return this.findLast(target, options);
        } else {
            return {row: row, col: col, found: true};
        }
    };

    Vimulator.Base.prototype.moveToLast = function (target, options) {
        var position = this.findLast(target, options);
        this.moveCursor(position);
        return position.found;
    };

    Vimulator.Base.prototype.cursorCopy = function () {
        return {
            row: this.cursor.row,
            col: this.cursor.col
        };
    };
}());

// renderer.js
(function () {
    Vimulator.Renderer = function () {
    };

    Vimulator.Renderer.prototype.init = function (container) {
        this.container = $(container);
        this.textContainer = findOrBuild(this.container, 'pre');
        this.commandLine = findOrBuild(this.container, 'p');

        this.container.addClass('vimulator');
        this.commandLine.addClass('command-line');

        return this;
    };

    Vimulator.Renderer.prototype.bindKeyListener = function (handler) {
        var input = $('<input type="text">').appendTo(this.container)
                                            .focus()
                                            .blur(function () {
                                                $(this).focus();
                                            });

        // Use keyup for special characters like escape
        $(window).keyup(function (e) {
            var code = e.charCode || e.keyCode;
            if (specialKeyCode(code)) {
                handler(code);
                return false;
            }
        });

        // Use keypress for general characters
        $(window).keypress(function (e) {
            var code = e.charCode || e.keyCode;
            if (code >= 32) {
                handler(code);
                return false;
            }
        });
    };

    Vimulator.Renderer.prototype.renderMode = function (modeName) {
        this.textContainer.attr('class', modeName);
    };

    Vimulator.Renderer.prototype.renderText = function (lines, cursor) {
        var renderedLines = jQuery.map(lines, function (line, i) {
            if (cursor && i == cursor.row) {
                return markWithCursor(line, cursor.col);
            } else {
                return line;
            }
        });
        this.textContainer.html(renderedLines.join('\n'));
    };

    Vimulator.Renderer.prototype.renderCommandLine = function (text, cursor) {
        var renderedText;
        if (cursor) {
            renderedText = markWithCursor(text, cursor.col);
        } else {
            renderedText = text;
        }
        this.commandLine.html(renderedText || '&nbsp;');
    };

    Vimulator.Renderer.prototype.renderOperation = function (operation, vim) {
    };

    Vimulator.Renderer.prototype.readTextContainer = function () {
        return this.textContainer.text().split('\n');
    };

    function findOrBuild(container, tagName) {
        var element = container.find(tagName);
        if (element.length === 0) {
            element = $('<' + tagName + '/>').appendTo(container);
        }
        return element;
    }

    function markWithCursor(line, column) {
        var chr = line.substr(column, 1) || ' ';
        return line.substr(0, column) +
               '<mark class="cursor">' + chr + '</mark>' +
               line.substr(column + 1);
    }

    function specialKeyCode(code) {
        return (
            code === Vimulator.Utils.Keys.BACKSPACE.charCodeAt(0) ||
            code === Vimulator.Utils.Keys.ESC.charCodeAt(0) ||
            code === Vimulator.Utils.Keys.RETURN.charCodeAt(0)
        );
    }
}());

// demo_renderer.js
(function () {
    Vimulator.DemoRenderer = function (renderer) {
        this.renderer = renderer || new Vimulator.Renderer();
    };

    Vimulator.DemoRenderer.prototype.init = function () {
        this.delay = 500;
        this.renderer.init.apply(this.renderer, arguments);

        this.commandList = this.renderer.container.find('ol');
        if (this.commandList.length === 0) {
            this.commandList = $('<ol/>')
                    .appendTo(this.renderer.container);
        }

        return this;
    };

    Vimulator.DemoRenderer.prototype.renderOperation = function (op, vim) {
        var li;

        if (op && op.description(vim)) {
            li = this.commandList.find('li:first');
            if (li.length === 0 || li.hasClass('complete')) {
                li = $('<li></li>').prependTo(this.commandList);
            }
            li.html(op.description(vim))
              .toggleClass('complete', op.complete() || op.cancelled);
        }
    };

    delegateMethod('readTextContainer');
    delegateMethod('bindKeyListener');

    delayedDelegateMethod('renderText');
    delayedDelegateMethod('renderCommandLine');
    delayedDelegateMethod('renderMode');

    function delegateMethod(name) {
        Vimulator.DemoRenderer.prototype[name] = function () {
            return this.renderer[name].apply(this.renderer, arguments);
        };
    }

    function delayedDelegateMethod(name) {
        Vimulator.DemoRenderer.prototype[name] = function () {
            var renderer = this.renderer,
                args = arguments;
            setTimeout(function () {
                renderer[name].apply(renderer, args);
            }, this.delay);
        };
    }
}());

// search.js
(function () {
    var reverseOp, performSearch;

    reverseOp = {
        'moveToNext': 'moveToLast',
        'moveToLast': 'moveToNext'
    };

    performSearch = function (term, count, op) {
        term = term || this.vim.registers['/'];
        count = count || 1;

        if (op && term) {
            this.vim[op](term, {wrap: true, loop: true, count: count});
            this.vim.registers['/'] = term;
            this.lastOp = op;
        }
    };

    Vimulator.Search = function (vim) {
        this.vim = vim;
    };

    Vimulator.Search.prototype.forward = function (term, count) {
        performSearch.call(this, term, count, 'moveToNext');
    };

    Vimulator.Search.prototype.backward = function (term, count) {
        performSearch.call(this, term, count, 'moveToLast');
    };

    Vimulator.Search.prototype.repeat = function (count) {
        performSearch.call(this, null, count, this.lastOp);
    };

    Vimulator.Search.prototype.repeatReversed = function (count) {
        performSearch.call(this, null, count, reverseOp[this.lastOp]);
    };
}());

// utils.js
(function () {
    var K;

    Vimulator.Utils = {};

    Vimulator.Utils.Keys = K = {
        BACKSPACE:  '\u0008',
        RETURN:     '\u000D',
        ESC:        '\u001B'
    };

    Vimulator.Utils.pluralize = function (count, word, plural) {
        if (count === 1) {
            return "1 " + word;
        } else {
            plural = plural || word.replace(/y$/, "ie") + "s";
            return count + " " + plural;
        }
    };

    Vimulator.Utils.ordinalize = function (count) {
        if (/^(.*[^1])?1$/.test(count)) {
            return count + "st";
        } else if (/^(.*[^1])?2$/.test(count)) {
            return count + "nd";
        } else if (/^(.*[^1])?3$/.test(count)) {
            return count + "rd";
        } else {
            return count + "th";
        }
    };

    Vimulator.Utils.literalArgDescription = function (chr) {
        if (chr) {
            return "<kbd>" + this.keyName(chr) + "</kbd>";
        } else {
            return "<b>&hellip;</b>";
        }
    };

    Vimulator.Utils.keyName = function (chr) {
        if (chr === K.RETURN) { return "\u23CE"; }
        if (chr === K.ESC)    { return "\u241B"; }
        return chr;
    };
}());

// range.js
(function () {
    function assignOrdered(subject, start, end) {
        subject.originalStart = start;
        subject.originalEnd = end;

        if (start.row < end.row || start.row == end.row && start.col < end.col) {
            subject.start = start;
            subject.end = end;
        } else {
            subject.start = end;
            subject.end = start;
        }
    }

    Vimulator.CharacterRange = function (start, end, options) {
        this.inclusive = options.inclusive;
        assignOrdered(this, start, end);
    };

    Vimulator.CharacterRange.capture = function (rangeOptions, callback) {
        return function (vim) {
            var start, end;
            start = vim.cursorCopy();
            callback.apply(this, arguments);
            end = vim.cursorCopy();
            if (start.row == end.row && start.col == end.col) {
                return null;
            } else {
                return new Vimulator.CharacterRange(start, end, rangeOptions);
            }
        };
    };
    Vimulator.CharacterRange.captureExclusive = function (callback) {
        return this.capture({inclusive: false}, callback);
    };
    Vimulator.CharacterRange.captureInclusive = function (callback) {
        return this.capture({inclusive: true}, callback);
    };

    Vimulator.CharacterRange.prototype.removeFrom = function (buffer) {
        this.replaceIn(buffer, "");
    };

    Vimulator.CharacterRange.prototype.replaceIn = function (buffer, str) {
        var endOffset = this.inclusive ? 1 : 0;

        buffer.lines[this.start.row] =
                buffer.lines[this.start.row].substr(0, this.start.col) +
                str +
                buffer.lines[this.end.row].substr(this.end.col + endOffset);

        buffer.lines.splice(this.start.row + 1, this.end.row - this.start.row);
    };

    Vimulator.CharacterRange.prototype.toEOL = function (buffer) {
        return this.originalEnd.col === buffer.lines[this.originalEnd.row].length - 1;
    };

    Vimulator.CharacterRange.prototype.contains = function (position) {
        var r = position.row,
            c = position.col,
            afterStart, beforeEnd;

        afterStart = this.start.row < r ||
                     this.start.row === r && this.start.col <= c;

        beforeEnd = this.end.row > r ||
                    this.end.row === r &&
                    (this.end.col > c || this.inclusive && this.end.col === c);

        return afterStart && beforeEnd;
    };


    Vimulator.LineRange = function (start, end) {
        assignOrdered(this, start, end);
    };

    Vimulator.LineRange.capture = function (callback) {
        return function (vim) {
            var start, end;
            start = vim.cursorCopy();
            callback.apply(this, arguments);
            end = vim.cursorCopy();
            return new Vimulator.LineRange(start, end);
        }
    };

    Vimulator.LineRange.prototype.removeFrom = function (buffer) {
        var count = this.end.row - this.start.row + 1;
        buffer.lines.splice(this.start.row, count);
    };

    Vimulator.LineRange.prototype.replaceIn = function (buffer, str) {
        var count = this.end.row - this.start.row + 1;
        buffer.lines.splice(this.start.row, count, str);
    };

    Vimulator.LineRange.prototype.toEOL = function (buffer) {
        return false;
    };

    Vimulator.LineRange.prototype.captureFrom = function (buffer) {
        return buffer.lines.slice(this.start.row, this.end.row + 1).join('\n');
    };
}());

// operation.js
(function () {
    var U = Vimulator.Utils;

    Vimulator.Operation = function (context) {
        this.context = context;
        this.multiplier = null;
        this.commandPrefix = '';
        this.command = null;
        this.commandKey = null;
        this.argument = null;
        this.cancelled = false;
    };

    Vimulator.Operation.prototype.setCommand = function (command, key) {
        if (this.command) {
            throw new Error("This operation already has a command");
        }

        if (!command) {
            return;
        }

        this.command = command;
        this.commandKey = key;
        this.argument = command.buildArgument();
    };

    Vimulator.Operation.prototype.keyPress = function (key) {
        var validKey;

        if (this.cancelled) {
            throw new Error("Operation is cancelled");
        }

        validKey = this.captureMultiplier(key) ||
                   this.captureCommandPrefix(key) ||
                   this.captureCommand(key) ||
                   this.captureArgument(key);

        if (!validKey) {
            this.cancel();
        }
    };

    Vimulator.Operation.prototype.captureMultiplier = function (key) {
        if (
            this.command || this.commandPrefix ||
            (key < '1' || key > '9') && (key !== '0' || !this.multiplier)
        ) {
            return false;
        }

        this.multiplier = ~~('' + (this.multiplier || '') + key);
        return true;
    };

    Vimulator.Operation.prototype.captureCommandPrefix = function (key) {
        if (this.command || this.commandPrefix || !/[gz]/.test(key)) {
            return false;
        }

        this.commandPrefix = key;
        return true;
    };

    Vimulator.Operation.prototype.captureCommand = function (key) {
        var cmd;

        if (this.command) {
            return false;
        }

        key = this.commandPrefix + key;
        cmd = this.context.getCommand(key);
        this.setCommand(cmd, key);
        return !!cmd;
    };

    Vimulator.Operation.prototype.captureArgument = function (key) {
        if (!this.argument || this.argument.complete()) {
            return false;
        }

        this.argument.keyPress(key);
        return true;
    };

    Vimulator.Operation.prototype.complete = function () {
        return !!(this.command && this.argument && this.argument.complete());
    };

    Vimulator.Operation.prototype.execute = function (vim, parentMultiplier) {
        var multiplier;

        if (!this.complete()) {
            return false;
        }

        multiplier = this.multiply(parentMultiplier);
        return this.command.execute(vim, multiplier, this.argument.value());
    };

    Vimulator.Operation.prototype.multiply = function (factor) {
        if (!factor) {
            return this.multiplier;
        }
        return factor * (this.multiplier || 1);
    };

    Vimulator.Operation.prototype.description = function (vim) {
        var desc, keys, multiplier;

        keys = function (str) {
            var i, keys;

            if (!str) {
                return '';
            }

            str = '' + str;
            keys = [];
            for (i = 0; i < str.length; i++) {
                keys.push("<kbd>" + U.keyName(str.charAt(i)) + "</kbd>");
            }
            return keys.join(' ') + ' ';
        };
        
        desc = keys(this.multiplier) +
               keys(this.commandKey || this.commandPrefix);

        if (this.command) {
            desc += this.command.description(
                this.multiplier,
                this.argument.value(),
                vim
            );
        } else if (!this.cancelled) {
            desc += '<b>&hellip;</b>';
        }

        return desc.replace(/\s+$/, "");
    };

    Vimulator.Operation.prototype.repeatable = function () {
        return this.complete() && this.command.repeatable;
    };

    Vimulator.Operation.prototype.cancel = function () {
        this.cancelled = true;
    };

    // Gives Operations a consistent interface with Arguments
    Vimulator.Operation.prototype.value = function () {
        return this;
    };

    Vimulator.Operation.prototype.commandLineText = function () {
        if (!this.cancelled && this.commandKey && this.argument) {
            return this.argument.commandLineText(this.commandKey);
        } else {
            return '';
        }
    };
}());

// command.js
(function () {
    Vimulator.Command = function (options) {
        this.argConstructor = options.argument || Vimulator.NoArgument;
        this.callback = options.callback;
        this.subCommands = options.subCommands;
        this.defaultCount = "defaultCount" in options ? options.defaultCount : 1;
        this.repeatable = options.repeatable || false;

        if (typeof options.description === "function") {
            this.description = function (count, arg, vim) {
                count = count === null ? this.defaultCount : count;
                return options.description(count, arg, vim);
            };
        } else {
            this.description = function () {
                return options.description || "";
            };
        }
    };

    Vimulator.Command.prototype.buildArgument = function () {
        return new this.argConstructor(this);
    };

    Vimulator.Command.prototype.getCommand = function (key) {
        return this.subCommands.getCommand(key);
    };

    Vimulator.Command.prototype.execute = function (vim, count, argument) {
        count = count === null ? this.defaultCount : count;
        return this.callback(vim, count, argument);
    };
}());

// command_list.js
(function () {
    Vimulator.CommandList = function () {
        var k, sources, source, commands;

        sources = Array.prototype.slice.call(arguments);
        commands = sources.pop();

        while (sources.length > 0) {
            source = sources.pop();
            (function () {
                var constructor = function () {};
                constructor.prototype = commands;
                commands = new constructor();
                for (k in source) {
                    if (source.hasOwnProperty(k)) {
                        commands[k] = source[k];
                    }
                }
            }());
        }

        this.commands = commands;
    };

    Vimulator.CommandList.prototype.getCommand = function (key) {
        return this.commands[key];
    };
}());

// arguments.js
(function () {
    var U = Vimulator.Utils;

    Vimulator.NoArgument = function () {};
    Vimulator.NoArgument.prototype.keyPress = function () {};
    Vimulator.NoArgument.prototype.complete = function () {
        return true;
    };
    Vimulator.NoArgument.prototype.value = function () {
        return null;
    };
    Vimulator.NoArgument.prototype.commandLineText = function (key) {
        return '';
    };


    Vimulator.LiteralArgument = function () {
        this.key = null;
    };
    Vimulator.LiteralArgument.prototype.keyPress = function (key) {
        this.key = key;
    };
    Vimulator.LiteralArgument.prototype.complete = function () {
        return !!this.key;
    };
    Vimulator.LiteralArgument.prototype.value = function () {
        return this.key;
    };
    Vimulator.LiteralArgument.prototype.commandLineText = function (key) {
        return '';
    };


    Vimulator.CommandLineArgument = function () {
        this.command = "";
        this.finished = false;
    };
    Vimulator.CommandLineArgument.prototype.keyPress = function (key) {
        if (key === U.Keys.RETURN) {
            this.finished = true;
        } else {
            this.command += key;
        }
    };
    Vimulator.CommandLineArgument.prototype.complete = function () {
        return this.finished;
    };
    Vimulator.CommandLineArgument.prototype.value = function () {
        return this.command;
    };
    Vimulator.CommandLineArgument.prototype.commandLineText = function (key) {
        return key + this.command;
    };
}());

// words.js
(function () {
    function after(collection, col, count) {
        var found, result, i;

        result = {found: 0, col: col};
        count = count || 1;
        for (i = 0; i < collection.length; i++) {
            if (collection[i] > col) {
                result.found += 1;
                result.col = collection[i];
            }

            if (result.found >= count) {
                return result;
            }
        }

        return result;
    }

    function before(collection, col, count) {
        var found, result, i;

        result = {found: 0, col: col};
        count = count || 1;
        for (i = collection.length - 1; i >= 0; i -= 1) {
            if (collection[i] < col) {
                result.found += 1;
                result.col = collection[i];
            }

            if (result.found >= count) {
                return result;
            }
        }

        return result;
    }

    Vimulator.Words = function (line, matchWORDS) {
        var matches, words, word, regexp, col;

        this.words = [];
        this.beginnings = [];
        this.endings = [];

        regexp = matchWORDS ? /^(\s+|[^\s]+)(.*)$/i
                            : /^([a-z0-9_]+|\s+|[^a-z0-9_\s]+)(.*)$/i;

        col = 0;
        while (matches = line.match(regexp)) {
            word = matches[1];
            this.words.push(word);
            line = matches[2];

            if (!word.match(/^\s+$/)) {
                this.beginnings.push(col);
                col += word.length;
                this.endings.push(col - 1);
            } else {
                col += word.length;
            }
        }
    };

    Vimulator.Words.prototype.beginningBefore = function (col, count) {
        return before(this.beginnings, col, count);
    };

    Vimulator.Words.prototype.beginningAfter = function (col, count) {
        return after(this.beginnings, col, count);
    };

    Vimulator.Words.prototype.endingAfter = function (col, count) {
        return after(this.endings, col, count);
    };
}());

// text_objects.js
(function () {
    function findPairs(lines, start, end) {
        var row, col, line, chr, pairs, startStack;

        pairs = [];
        startStack = [];

        for (row = 0; row < lines.length; row++) {
            line = lines[row];
            for (col = 0; col < line.length; col++) {
                chr = line.charAt(col);
                if (chr === start) {
                    startStack.push({row: row, col: col});
                } else if (chr === end && startStack.length > 0) {
                    pairs.push(new Vimulator.CharacterRange(
                        startStack.pop(),
                        {row: row, col: col},
                        {inclusive: true}
                    ));
                }
            }
        }

        return pairs;
    }

    Vimulator.TextObject = function (options) {
        this.startDelim = options.start;
        this.endDelim = options.end;
        this.name = options.name;
    };

    Vimulator.TextObject.prototype.insideRange = function (vim) {
        var pairs, i, p;

        pairs = findPairs(vim.lines, this.startDelim, this.endDelim);
        for (i = 0; i < pairs.length; i++) {
            p = pairs[i];
            if (p.contains(vim.cursor)) {
                p.start.col += 1;
                p.end.col -= 1;
                return p;
            }
        }

        return null;
    };

    Vimulator.TextObject.prototype.aroundRange = function (vim) {
        var pairs, i, p;

        pairs = findPairs(vim.lines, this.startDelim, this.endDelim);
        for (i = 0; i < pairs.length; i++) {
            p = pairs[i];
            if (p.contains(vim.cursor)) {
                return p;
            }
        }

        return null;
    };

    Vimulator.TextObject.Commands = (function () {
        var C, U, textObjects;

        C = Vimulator.Command;
        U = Vimulator.Utils;

        textObjects = {};
        textObjects['b'] = new Vimulator.TextObject({
            name: "parentheses",
            start: '(',
            end: ')'
        });
        textObjects['('] = textObjects['b'];
        textObjects[')'] = textObjects['b'];

        textObjects['['] = new Vimulator.TextObject({
            name: "square brackets",
            start: '[',
            end: ']'
        });
        textObjects[']'] = textObjects['['];

        textObjects['B'] = new Vimulator.TextObject({
            name: "curly braces",
            start: '{',
            end: '}'
        });
        textObjects['{'] = textObjects['B'];
        textObjects['}'] = textObjects['B'];

        return {
            'a': new C({
                argument: Vimulator.LiteralArgument,
                callback: function (vim, count, key) {
                    var textObject = textObjects[key];
                    if (textObject) {
                        return textObject.aroundRange(vim);
                    } else {
                        vim.mode.cancelOperation();
                    }
                },
                description: function (count, key) {
                    var desc, textObject;
                    desc = "around " + U.literalArgDescription(key);
                    textObject = textObjects[key];
                    if (textObject) {
                        desc += " " + textObject.name;
                    } else if (key) {
                        desc += " (unknown text object)";
                    }
                    return desc;
                }
            }),
            'i': new C({
                argument: Vimulator.LiteralArgument,
                callback: function (vim, count, key) {
                    var textObject = textObjects[key];
                    if (textObject) {
                        return textObject.insideRange(vim);
                    } else {
                        vim.mode.cancelOperation();
                    }
                },
                description: function (count, key) {
                    var desc, textObject;
                    desc = "inside " + U.literalArgDescription(key);
                    textObject = textObjects[key];
                    if (textObject) {
                        desc += " " + textObject.name;
                    } else if (key) {
                        desc += " (unknown text object)";
                    }
                    return desc;
                }
            })
        };
    }());
}());

// normal_mode.js
(function () {
    var U = Vimulator.Utils;

    Vimulator.NormalMode = function (vim) {
        this.name = "normal";
        this.vim = vim;
        this.buildOperation();
    };

    Vimulator.NormalMode.prototype.enter = function () {
    };

    Vimulator.NormalMode.prototype.buildOperation = function () {
        this.currentOperation = new Vimulator.Operation(this.commandList());
    };

    Vimulator.NormalMode.prototype.cancelOperation = function () {
        this.currentOperation.cancel();
        this.buildOperation();
    };

    Vimulator.NormalMode.prototype.commandList = function () {
        this.commands = this.commands || new Vimulator.CommandList(
            Vimulator.NormalMode.Motions,
            Vimulator.NormalMode.Insertion,
            Vimulator.NormalMode.Edits,
            Vimulator.NormalMode.LineSearch,
            Vimulator.NormalMode.Operators,
            Vimulator.NormalMode.Repeat,
            Vimulator.NormalMode.Marks,
            Vimulator.NormalMode.MarkMotions,
            Vimulator.NormalMode.Search,
            Vimulator.NormalMode.Yank
        );
        return this.commands;
    };

    Vimulator.NormalMode.prototype.keyPress = function (key) {
        var op = this.currentOperation;

        if (key === U.Keys.ESC) {
            this.cancelOperation();
        } else {
            op.keyPress(key);
            if (op.complete()) {
                op.execute(this.vim);
            }

            if (op.complete() || op.cancelled) {
                this.buildOperation();
            }
        }

        return op;
    };
}());

// normal_mode/motions.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils,
        CR = Vimulator.CharacterRange,
        LR = Vimulator.LineRange;

    Vimulator.NormalMode.Motions = {
        // Character motions

        'h': new C({
            callback: CR.captureExclusive(function (vim, count) {
                vim.moveCursorRelative(0, -count);
            }),
            description: function (count) {
                return "Move left " + U.pluralize(count, "character");
            }
        }),

        'j': new C({
            callback: LR.capture(function (vim, count) {
                vim.moveCursorRelative(count, 0);
            }),
            description: function (count) {
                return "Move down " + U.pluralize(count, "line");
            }
        }),

        'k': new C({
            callback: LR.capture(function (vim, count) {
                vim.moveCursorRelative(-count, 0);
            }),
            description: function (count) {
                return "Move up " + U.pluralize(count, "line");
            }
        }),

        'l': new C({
            callback: CR.captureExclusive(function (vim, count) {
                vim.moveCursorRelative(0, count);
            }),
            description: function (count) {
                return "Move right " + U.pluralize(count, "character");
            }
        }),


        // Line motions

        '0': new C({
            callback: CR.captureExclusive(function (vim) {
                vim.moveCursorCol(0);
            }),
            description: "Move to the start of the line"
        }),

        '$': new C({
            callback: CR.captureInclusive(function (vim, count) {
                vim.moveCursorRelative(count - 1, '$');
            }),
            description: function (count) {
                if (count === 1) {
                    return "Move to the end of the line";
                } else {
                    return "Move to the end of the " + U.ordinalize(count - 1) +
                           " line after the cursor";
                }
            }
        }),

        '^': new C({
            callback: CR.captureExclusive(function (vim) {
                vim.moveCursorCol('^');
            }),
            description: "Move to the first non-space on the line",
        }),


        // Word motions
        //TODO DRY this code

        'w': new C({
            callback: CR.captureExclusive(function (vim, count) {
                var words, result;

                while (true) {
                    words = new Vimulator.Words(vim.currentLine(), false);
                    result = words.beginningAfter(vim.cursor.col, count);

                    count -= result.found;
                    if (count <= 0) {
                        vim.moveCursorCol(result.col);
                        return;
                    } else if (vim.cursor.row < vim.lines.length - 1) {
                        vim.moveCursorRelative(1, 0);
                        vim.cursor.col = -1; //FIXME
                    } else {
                        vim.moveCursorRelative(0, '$');
                        return;
                    }
                }
            }),
            description: function (count) {
                return "Move forward " + U.pluralize(count, "word");
            }
        }),

        'W': new C({
            callback: CR.captureExclusive(function (vim, count) {
                var words, result;

                while (true) {
                    words = new Vimulator.Words(vim.currentLine(), true);
                    result = words.beginningAfter(vim.cursor.col, count);

                    count -= result.found;
                    if (count <= 0) {
                        vim.moveCursorCol(result.col);
                        return;
                    } else if (vim.cursor.row < vim.lines.length - 1) {
                        vim.moveCursorRelative(1, 0);
                        vim.cursor.col = -1; //FIXME
                    } else {
                        vim.moveCursorRelative(0, '$');
                        return;
                    }
                }
            }),
            description: function (count) {
                return "Move forward " + U.pluralize(count, "word") +
                       " (including punctuation)";
            }
        }),

        'e': new C({
            callback: CR.captureInclusive(function (vim, count) {
                var words, result;

                while (true) {
                    words = new Vimulator.Words(vim.currentLine(), false);
                    result = words.endingAfter(vim.cursor.col, count);

                    count -= result.found;
                    if (count <= 0) {
                        vim.moveCursorCol(result.col);
                        return;
                    } else if (vim.cursor.row < vim.lines.length - 1) {
                        vim.moveCursorRelative(1, 0);
                        vim.cursor.col = -1; //FIXME
                    } else {
                        return;
                    }
                }
            }),
            description: function (count) {
                if (count === 1) {
                    return "Move to the next word end";
                } else {
                    return "Move the " + U.ordinalize(count) + " word end " +
                           "after the cursor";
                }
            }
        }),

        'E': new C({
            callback: CR.captureInclusive(function (vim, count) {
                var words, result;

                while (true) {
                    words = new Vimulator.Words(vim.currentLine(), true);
                    result = words.endingAfter(vim.cursor.col, count);

                    count -= result.found;
                    if (count <= 0) {
                        vim.moveCursorCol(result.col);
                        return;
                    } else if (vim.cursor.row < vim.lines.length - 1) {
                        vim.moveCursorRelative(1, 0);
                        vim.cursor.col = -1; //FIXME
                    } else {
                        return;
                    }
                }
            }),
            description: function (count) {
                if (count === 1) {
                    return "Move to the next word end (including punctuation)";
                } else {
                    return "Move the " + U.ordinalize(count) + " word end " +
                           "after the cursor (including punctuation)";
                }
            }
        }),

        'b': new C({
            callback: CR.captureExclusive(function (vim, count) {
                var words, result;

                while (true) {
                    words = new Vimulator.Words(vim.currentLine(), false);
                    result = words.beginningBefore(vim.cursor.col, count);

                    count -= result.found;
                    if (count <= 0) {
                        vim.moveCursorCol(result.col);
                        return;
                    } else if (vim.cursor.row > 0) {
                        vim.moveCursorRelative(-1, '$');
                    } else {
                        return;
                    }
                }
            }),
            description: function (count) {
                return "Move back " + U.pluralize(count, "word");
            }
        }),

        'B': new C({
            callback: CR.captureExclusive(function (vim, count) {
                var words, result;

                while (true) {
                    words = new Vimulator.Words(vim.currentLine(), true);
                    result = words.beginningBefore(vim.cursor.col, count);

                    count -= result.found;
                    if (count <= 0) {
                        vim.moveCursorCol(result.col);
                        return;
                    } else if (vim.cursor.row > 0) {
                        vim.moveCursorRelative(-1, '$');
                    } else {
                        return;
                    }
                }
            }),
            description: function (count) {
                return "Move back " + U.pluralize(count, "word") +
                       " (including punctuation)";
            }
        }),


        // File motions

        'gg': new C({
            defaultCount: null,
            callback: LR.capture(function (vim, count) {
                var row = count ? count - 1 : 0;
                vim.moveCursor(row, '^');
            }),
            description: function (count) {
                if (count) {
                    return "Jump to line " + count;
                } else {
                    return "Jump to the start of the file";
                }
            }
        }),

        'G': new C({
            defaultCount: null,
            callback: LR.capture(function (vim, count) {
                var row = count ? count - 1 : '$';
                vim.moveCursor(row, '^');
            }),
            description: function (count) {
                if (count) {
                    return "Jump to line " + count;
                } else {
                    return "Jump to the end of the file";
                }
            }
        }),

        '+': new C({
            callback: LR.capture(function (vim, count) {
                vim.moveCursorRelative(count, '^');
            }),
            description: function (count) {
                if (count === 1) {
                    return "Move to the start of the next line";
                } else {
                    return "Move to the start of the " + U.ordinalize(count) +
                           " line after the cursor";
                }
            }
        }),
        '-': new C({
            callback: LR.capture(function (vim, count) {
                vim.moveCursorRelative(-count, '^');
            }),
            description: function (count) {
                if (count === 1) {
                    return "Move to the start of the previous line";
                } else {
                    return "Move to the start of the " + U.ordinalize(count) +
                           " line before the cursor";
                }
            }
        })
    };

    Vimulator.NormalMode.Motions[U.Keys.RETURN] = Vimulator.NormalMode.Motions['+'];
}());

// normal_mode/marks.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils,
        CR = Vimulator.CharacterRange,
        LR = Vimulator.LineRange;

    Vimulator.NormalMode.Marks = {
        'm': new C({
            argument: Vimulator.LiteralArgument,
            callback: function (vim, count, name) {
                vim.marks[name] = vim.cursorCopy();
            },
            description: function (count, name) {
                return "Create a mark at the cursor called " +
                       U.literalArgDescription(name);
            }
        })
    };

    Vimulator.NormalMode.MarkMotions = {
        '`': new C({
            argument: Vimulator.LiteralArgument,
            callback: CR.captureExclusive(function (vim, count, name) {
                var mark = vim.marks[name];
                vim.moveCursor(mark);
            }),
            description: function (count, name, vim) {
                var mark, desc;

                mark = vim.marks[name];
                desc = "Move to mark " + U.literalArgDescription(name);
                if (name && mark) {
                    desc += " (line " + (mark.row + 1) +
                            ", column " + (mark.col + 1) + ")";
                } else if (name) {
                    desc += " (No such mark is set, use <kbd>m</kbd> " +
                            U.literalArgDescription(name) + " first)";
                }
                return desc;
            }
        }),
        "'": new C({
            argument: Vimulator.LiteralArgument,
            callback: LR.capture(function (vim, count, name) {
                var mark = vim.marks[name];
                if (mark) {
                    vim.moveCursor(mark.row, '^');
                }
            }),
            description: function (count, name, vim) {
                var mark, desc;

                mark = vim.marks[name];
                desc = "Move to the line containing mark " +
                       U.literalArgDescription(name);

                if (name && mark) {
                    desc += " (line " + (mark.row + 1) + ")";
                } else if (name) {
                    desc += " (No such mark is set, use <kbd>m</kbd> " +
                            U.literalArgDescription(name) + " first)";
                }
                return desc;
            }
        })
    };
}());

// normal_mode/insertion.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils;

    Vimulator.NormalMode.Insertion = {
        'i': new C({
            repeatable: true,
            callback: function (vim) {
                vim.setMode("insert");
            },
            description: "Insert text before the cursor"
        }),

        'I': new C({
            repeatable: true,
            callback: function (vim) {
                vim.moveCursorCol('^');
                vim.setMode("insert");
            },
            description: "Insert text at the start of the line" +
                         " (after leading whitespace)"
        }),

        'gI': new C({
            repeatable: true,
            callback: function (vim) {
                vim.moveCursorCol(0);
                vim.setMode("insert");
            },
            description: "Insert text at the start of the line" +
                         " (before leading whitespace)"
        }),

        'a': new C({
            repeatable: true,
            callback: function (vim) {
                vim.cursor.col += 1; //FIXME
                vim.setMode("insert");
            },
            description: "Append text after the cursor"
        }),

        'A': new C({
            repeatable: true,
            callback: function (vim) {
                vim.moveCursorCol('$');
                vim.cursor.col += 1; //FIXME
                vim.setMode("insert");
            },
            description: "Append text at the end of the line"
        }),

        'o': new C({
            repeatable: true,
            callback: function (vim) {
                vim.insertRowBelow('');
                vim.moveCursor(vim.cursor.row + 1, 1);
                vim.setMode("insert");
            },
            description: "Insert text on a new line after the cursor"
        }),

        'O': new C({
            repeatable: true,
            callback: function (vim) {
                vim.insertRowAbove('');
                vim.moveCursorCol(1);
                vim.setMode("insert");
            },
            description: "Insert text on a new line before the cursor"
        }),

        's': new C({
            repeatable: true,
            callback: function (vim, count) {
                var line = vim.currentLine();
                vim.replaceRow(
                    line.substr(0, vim.cursor.col) +
                    line.substr(vim.cursor.col + count)
                );
                vim.setMode("insert");
            },
            description: function (count) {
                return "Substitute " + U.pluralize(count, "character") +
                       " under the cursor";
            }
        }),

        'S': new C({
            repeatable: true,
            callback: function (vim, count) {
                vim.replaceRow('');
                vim.moveCursorCol(0);

                if (count > 1) {
                    startRow = vim.cursor.row + 1;
                    vim.removeRows(startRow, startRow + count - 1);
                }

                vim.setMode("insert");
            },
            description: function (count) {
                if (count === 1) {
                    return "Substitute this line";
                } else {
                    return "Substitute this line, and the next " +
                           U.pluralize(count - 1, "line");
                }
            }
        })
    };
}());

// normal_mode/edits.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils;

    Vimulator.NormalMode.Edits = {
        'x': new C({
            repeatable: true,
            callback: function (vim, count) {
                var line = vim.currentLine();
                vim.replaceRow(
                    line.substr(0, vim.cursor.col) +
                    line.substr(vim.cursor.col + count)
                );
                vim.moveCursorRelative(0, 0);
            },
            description: function (count) {
                return "Delete " + U.pluralize(count, "character") +
                       " under the cursor";
            }
        }),

        'X': new C({
            repeatable: true,
            callback: function (vim, count) {
                var line = vim.currentLine();
                vim.replaceRow(
                    line.substr(0, vim.cursor.col - count) +
                    line.substr(vim.cursor.col)
                );
                vim.moveCursorRelative(0, -count);
            },
            description: function (count) {
                return "Delete " + U.pluralize(count, "character") +
                       " before the cursor";
            }
        }),

        'r': new C({
            repeatable: true,
            argument: Vimulator.LiteralArgument,
            callback: function (vim, count, replacement) {
                var line, repeat;

                line = vim.currentLine();

                if (vim.cursor.col + count > line.length) {
                    return;
                }

                vim.replaceRow(
                    line.substr(0, vim.cursor.col) +
                    new Array(count + 1).join(replacement) +
                    line.substr(vim.cursor.col + count)
                );
                vim.moveCursorRelative(0, count - 1);
            },
            description: function (count, replacement) {
                return "Replace " + U.pluralize(count, "character") +
                       " with " + U.literalArgDescription(replacement);
            }
        }),

        'D': new C({
            repeatable: true,
            callback: function (vim, count) {
                var line, startRow;

                line = vim.currentLine();
                vim.replaceRow(line.substr(0, vim.cursor.col));
                vim.moveCursorRelative(0, -1);

                if (count > 1) {
                    startRow = vim.cursor.row + 1;
                    vim.removeRows(startRow, startRow + count - 1);
                }
            },
            description: function (count) {
                if (count === 1) {
                    return "Delete to the end of the line";
                } else {
                    return "Delete to the end of the " + U.ordinalize(count-1) +
                           " line after the cursor";
                }
            }
        }),

        'C': new C({
            repeatable: true,
            callback: function (vim, count) {
                var line, startRow;

                line = vim.currentLine();
                vim.replaceRow(line.substr(0, vim.cursor.col));
                vim.moveCursorRelative(0, -1);

                if (count > 1) {
                    startRow = vim.cursor.row + 1;
                    vim.removeRows(startRow, startRow + count - 1);
                }

                vim.moveCursorCol('$');
                vim.cursor.col += 1; //FIXME
                vim.setMode("insert");
            },
            description: function (count) {
                if (count === 1) {
                    return "Change to the end of the line";
                } else {
                    return "Change to the end of the " + U.ordinalize(count-1) +
                           " line after the cursor";
                }
            }
        })
    };
}());

// normal_mode/line_search.js
(function () {
    var C, U, CR, findForwards, untilForwards, findBackwards, untilBackwards,
        lastLineSearch;

    C = Vimulator.Command;
    U = Vimulator.Utils;
    CR = Vimulator.CharacterRange;

    findForwards = CR.captureInclusive(function (vim, count, chr) {
        vim.moveToNext(chr, {count: count});
    });

    untilForwards = CR.captureInclusive(function (vim, count, chr, repeat) {
        if (vim.currentLine().charAt(vim.cursor.col + 1) === chr) {
            if (repeat && count === 1) {
                count += 1;
            } else if (!repeat) {
                count -= 1;
            }
        }
        if (findForwards(vim, count, chr)) {
            vim.moveCursorRelative(0, -1);
        }
    });

    findBackwards = CR.captureExclusive(function (vim, count, chr) {
        vim.moveToLast(chr, {count: count});
    });

    untilBackwards = CR.captureExclusive(function (vim, count, chr, repeat) {
        if (vim.currentLine().charAt(vim.cursor.col - 1) === chr) {
            if (repeat && count === 1) {
                count += 1;
            } else if (!repeat) {
                count -= 1;
            }
        }
        if (findBackwards(vim, count, chr)) {
            vim.moveCursorRelative(0, 1);
        }
    });

    Vimulator.NormalMode.LineSearch = {
        'f': new C({
            argument: Vimulator.LiteralArgument,
            callback: function (vim, count, chr) {
                lastLineSearch = {op: 'f', chr: chr};
                return findForwards(vim, count, chr);
            },
            description: function (count, chr) {
                return "Find the " + U.ordinalize(count) + " occurence of " +
                       U.literalArgDescription(chr) + " after the cursor";
            }
        }),

        'F': new C({
            argument: Vimulator.LiteralArgument,
            callback: function (vim, count, chr) {
                lastLineSearch = {op: 'F', chr: chr};
                return findBackwards(vim, count, chr);
            },
            description: function (count, chr) {
                return "Find the " + U.ordinalize(count) + " occurence of " +
                       U.literalArgDescription(chr) + " before the cursor";
            }
        }),

        't': new C({
            argument: Vimulator.LiteralArgument,
            callback: function (vim, count, chr) {
                lastLineSearch = {op: 't', chr: chr};
                return untilForwards(vim, count, chr);
            },
            description: function (count, chr) {
                return "Move to the " + U.ordinalize(count) + " occurence of " +
                       U.literalArgDescription(chr) + " after the cursor";
            }
        }),

        'T': new C({
            argument: Vimulator.LiteralArgument,
            callback: function (vim, count, chr) {
                lastLineSearch = {op: 'T', chr: chr};
                return untilBackwards(vim, count, chr);
            },
            description: function (count, chr) {
                return "Move to the " + U.ordinalize(count) + " occurence of " +
                       U.literalArgDescription(chr) + " before the cursor";
            }
        }),

        ';': new C({
            callback: function (vim, count) {
                var findFuncs;

                if (!lastLineSearch) {
                    return;
                }

                findFuncs = {
                    'f': findForwards,
                    'F': findBackwards,
                    't': untilForwards,
                    'T': untilBackwards
                };

                return findFuncs[lastLineSearch.op](vim, count, lastLineSearch.chr, true);
            },
            description: function (count) {
                desc = "Repeat the last line search ";
                if (count > 1) {
                    desc += count + " times";
                }
                return desc;
            }
        }),

        ',': new C({
            callback: function (vim, count) {
                var findFuncs;

                if (!lastLineSearch) {
                    return;
                }

                findFuncs = {
                    'f': findBackwards,
                    'F': findForwards,
                    't': untilBackwards,
                    'T': untilForwards
                };

                findFuncs[lastLineSearch.op](vim, count, lastLineSearch.chr, true);
            },
            description: function (count) {
                desc = "Repeat the last line search backwards ";
                if (count > 1) {
                    desc += count + " times";
                }
                return desc;
            }
        })
    };

}());

// normal_mode/search.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils,
        CR = Vimulator.CharacterRange;

    Vimulator.NormalMode.Search = {
        '/': new C({
            argument: Vimulator.CommandLineArgument,
            callback: CR.captureExclusive(function (vim, count, searchTerm) {
                vim.search.forward(searchTerm, count);
            }),
            description: function (count, searchTerm) {
                return "Search forwards for the " + U.ordinalize(count) +
                       " match for " + (searchTerm || "&hellip;");
            }
        }),

        '?': new C({
            argument: Vimulator.CommandLineArgument,
            callback: CR.captureExclusive(function (vim, count, searchTerm) {
                vim.search.backward(searchTerm, count);
            }),
            description: function (count, searchTerm) {
                return "Search backwards for the " + U.ordinalize(count) +
                       " match for " + (searchTerm || "&hellip;");
            }
        }),

        'n': new C({
            callback: CR.captureExclusive(function (vim, count) {
                vim.search.repeat(count);
            }),
            description: function (count) {
                return "Move forward " + U.pluralize(count, "match", "matches")
                       + " for the previous search";
            }
        }),

        'N': new C({
            callback: CR.captureExclusive(function (vim, count) {
                vim.search.repeatReversed(count);
            }),
            description: function (count) {
                return "Move back " + U.pluralize(count, "match", "matches") +
                       " for the previous search";
            }
        })
    };
}());

// normal_mode/operators.js
(function () {
    var C, U, LR, deleteSubCommands, changeSubCommands;

    C = Vimulator.Command;
    U = Vimulator.Utils;
    LR = Vimulator.LineRange;

    deleteSubCommands = {
        'd': new C({
            repeatable: true,
            callback: LR.capture(function (vim, count) {
                vim.moveCursorRelative(count - 1, 0);
            }),
            description: function (count) {
                return U.pluralize(count, "whole line");
            }
        })
    };

    changeSubCommands = {
        'c': new C({
            repeatable: true,
            callback: LR.capture(function (vim, count) {
                vim.moveCursorRelative(count - 1, 0);
            }),
            description: function (count) {
                return U.pluralize(count, "whole line");
            }
        }),
        'w': Vimulator.NormalMode.Motions['e'],
        'W': Vimulator.NormalMode.Motions['E'],
    };

    Vimulator.NormalMode.Operators = {
        'd': new C({
            repeatable: true,
            argument: Vimulator.Operation,
            defaultCount: null,
            callback: function (vim, count, motion) {
                var range = motion.execute(vim, count);
                if (range) {
                    range.removeFrom(vim);
                    if (motion.commandKey === 'G') {
                        vim.moveCursor(range.start.row, '^');
                    } else {
                        vim.moveCursor(range.start.row, range.start.col);
                    }
                }
            },
            subCommands: new Vimulator.CommandList(
                deleteSubCommands,
                Vimulator.NormalMode.Motions,
                Vimulator.NormalMode.LineSearch,
                Vimulator.NormalMode.MarkMotions,
                Vimulator.NormalMode.Search,
                Vimulator.TextObject.Commands
            ),
            description: function (count, motion, vim) {
                var desc = "Delete ";
                if (motion) {
                    return desc + motion.description(vim);
                } else {
                    return desc + "<b>&hellip;</b>";
                }
            }
        }),

        'c': new C({
            repeatable: true,
            argument: Vimulator.Operation,
            defaultCount: null,
            callback: function (vim, count, motion) {
                var range, toEOL;
                range = motion.execute(vim, count);
                if (range) {
                    toEOL = range.toEOL(vim);
                    range.replaceIn(vim, "");
                    vim.moveCursor(range.start.row, range.start.col);
                    if (toEOL) {
                        vim.cursor.col += 1; //FIXME
                    }
                    vim.setMode("insert");
                    return;
                }
            },
            subCommands: new Vimulator.CommandList(
                changeSubCommands,
                Vimulator.NormalMode.Motions,
                Vimulator.NormalMode.LineSearch,
                Vimulator.NormalMode.MarkMotions,
                Vimulator.NormalMode.Search,
                Vimulator.TextObject.Commands
            ),
            description: function (count, motion, vim) {
                var desc = "Change ";
                if (motion) {
                    return desc + motion.description(vim);
                } else {
                    return desc + "<b>&hellip;</b>";
                }
            }
        })
    };
}());

// normal_mode/repeat.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils;

    Vimulator.NormalMode.Repeat = {
        '.': new C({
            callback: function (vim, count) {
                var i;
                for (i = 0; i < count; i += 1) {
                    vim.repeatLastEdit();
                }
            },
            description: function (count) {
                var desc = "Repeat last edit";
                if (count > 1) {
                    desc += " " + count + " times";
                }
                return desc;
            }
        })
    };
}());

// normal_mode/yank.js
(function () {
    var C, U, yankSubCommands, yank;

    C = Vimulator.Command;
    U = Vimulator.Utils;
    LR = Vimulator.LineRange;

    yank = function (vim, count, motion, register) {
        var range, yankedText, cursor;

        cursor = vim.cursorCopy();
        range = motion.execute(vim, count);
        if (range) {
            yankedText = range.captureFrom(vim);
            vim.registers[register] = yankedText;
        }

        vim.moveCursor(cursor.row, cursor.col);
    };

    yankSubCommands = {
        'y': new C({
            callback: LR.capture(function (vim, count) {
                vim.moveCursorRelative(count - 1, 0);
            }),
            description: function (count) {
                return U.pluralize(count, "whole line");
            }
        })
    };

    Vimulator.NormalMode.Yank = {
        'Y': new C({
            callback: function (vim, count) {
                return yank(vim, count, yankSubCommands['y'], '0');
            },
            description: function (count) {
                return "Yank " + U.pluralize(count, "whole line");
            }
        }),

        'y': new C({
            argument: Vimulator.Operation,
            callback: function (vim, count, motion) {
                return yank(vim, count, motion, '0');
            },
            subCommands: new Vimulator.CommandList(
                yankSubCommands
            ),
            description: function (count, motion, vim) {
                var desc = "Yank ";
                if (motion) {
                    return desc + motion.description(vim);
                } else {
                    return desc + "<b>&hellip;</b>";
                }
            }
        }),

        'p': new C({
            callback: function (vim, count) {
                var yankedText, i;

                yankedText = vim.registers['0'];
                if (yankedText) {
                    for (i = 0; i < count; i += 1) {
                        vim.insertRowBelow(yankedText);
                    }
                }

                vim.moveCursorRelative(1, '^');
            },
            description: "Put previous yanked text after the cursor"
        }),

        'P': new C({
            callback: function (vim, count) {
                var yankedText = vim.registers['0'];
                if (yankedText) {
                    for (i = 0; i < count; i += 1) {
                        vim.insertRowAbove(yankedText);
                    }
                }
            },
            description: "Put previous yanked text before the cursor"
        })
    };
}());

// insert_mode.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils;

    Vimulator.InsertMode = function (vim) {
        this.name = "insert";
        this.vim = vim;
    };

    Vimulator.InsertMode.prototype.enter = function () {
        this.vim.registers["."] = "";
    };

    Vimulator.InsertMode.prototype.commandList = function () {
        this.commands = this.commands || new Vimulator.CommandList(
            Vimulator.InsertMode.Commands
        );
        return this.commands;
    };

    Vimulator.InsertMode.prototype.keyPress = function (key) {
        var op;

        if (Vimulator.InsertMode.Commands.hasOwnProperty(key)) {
            op = new Vimulator.Operation(this.commandList());
            op.keyPress(key);
            op.execute(this.vim);
            return op;
        } else {
            this.vim.registers["."] += key;
            this.vim.appendChr(key);
        }
    };
}());

// insert_mode/commands.js
(function () {
    var C = Vimulator.Command,
        U = Vimulator.Utils;

    Vimulator.InsertMode.Commands = {};

    Vimulator.InsertMode.Commands[U.Keys.ESC] = new C({
        callback: function (vim) {
            vim.setMode("normal");
            vim.moveCursorRelative(0, -1);
        },
        description: function () {
            return "Return to normal mode";
        }
    });
}());
