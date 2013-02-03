(function () {
    var U,
        macroRegister,
        startCommand, stopCommand, replayCommand;

    U = Vimulator.Utils;

    startCommand = new Vimulator.Command({
        argument: Vimulator.LiteralArgument,
        callback: function (vim, count, register) {
            Vimulator.NormalMode.Macros.q = stopCommand;

            macroRegister = register;

            vim.registers[register] = "";
            vim.observeKeyPresses("macro-recorder", function (key) {
                vim.registers[register] += key;
            });
        },
        description: function (count, register) {
            return "Start recording a macro in register " +
                   U.literalArgDescription(register);
        }
    });

    stopCommand = new Vimulator.Command({
        callback: function (vim, count) {
            Vimulator.NormalMode.Macros.q = startCommand;
            vim.stopObservingKeyPresses("macro-recorder");
            vim.registers[macroRegister] = vim.registers[macroRegister]
                                                    .replace(/q$/, "");
        },
        description: function (count, register) {
            return "Stop recoding macro";
        }
    });

    replayCommand = new Vimulator.Command({
        argument: Vimulator.LiteralArgument,
        callback: function (vim, count, register) {
            var i, j, keys;

            // Hackity hack: Start a new op before finishing this one
            vim.modes.normal.buildOperation();

            keys = vim.registers[register];
            for (i = 0; i < count; i += 1) {
                for (j = 0; j < keys.length; j += 1) {
                    vim.keyPress(keys.charCodeAt(j));
                }
            }
        },
        description: function (count, register) {
            var desc = "Replay the macro in register " +
                       U.literalArgDescription(register);
            if (count > 1) {
                desc += " " + U.pluralize(count, "time");
            }
            return desc;
        }
    });

    Vimulator.NormalMode.Macros = {
        'q': startCommand,
        '@': replayCommand
    };
}());