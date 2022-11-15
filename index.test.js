require('ut-run').run({
    main: [
        () => ({
            test: () => [
                require('.')
            ]
        })
    ],
    method: 'unit',
    config: {
        implementation: 'port-schedule',
        test: true
    },
    params: {
        steps: [

        ]
    }
});
