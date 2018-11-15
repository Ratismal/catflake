const assert = require('assert');
const Catflake = require('../src/index.js');
const BigInt = require('big-integer');

describe('Catflake', function () {

  describe('general', function () {
    let catflake = new Catflake();
    it('should be deconstructable', function () {
      let input = '397282797158964394';
      // timestamp: 1514790000000 = 1110001110101010110100001010100011111
      // workerId: 4 - 00100
      // processId: 9 - 01001
      // increment: 3242 - 110010101010

      let flake = catflake.deconstruct(input);

      assert.equal(flake.timestamp.valueOf(), 1514790000000, 'Timestamp was incorrect');
      assert.equal(flake.workerId.valueOf(), 4, 'Worker ID was incorrect');
      assert.equal(flake.processId.valueOf(), 9, 'Process ID was incorrect');
      assert.equal(flake.increment.valueOf(), 3242, 'Increment was incorrect');
    });

    it('should be immutable', function () {
      let catflake = new Catflake();

      catflake.newprop = true;

      assert.equal(catflake.newprop, undefined, 'A new property was added');
    });

    describe('options', function () {
      it('should be immutable', function () {
        let catflake = new Catflake();

        catflake.options.newprop = true;

        assert.equal(catflake.options.newprop, undefined, 'A new property was added');
      });
    });
  });

  describe('sync', function () {
    let catflake = new Catflake();

    it('should generate unique snowflakes (50)', function () {
      let generated = [];
      for (let i = 0; i < 50; i++) {
        let flake = catflake.generate();
        assert(!generated.includes(flake), `A duplicate snowflake was generated: ${flake}\n\n${generated.join('\n')}`);
        generated.push(flake);
      }
    });

    it('should properly roll over', function () {
      catflake.mutable.increment = BigInt(4095);

      let flake = catflake.generate();

      let deconstructed = catflake.deconstruct(flake);

      assert.equal(deconstructed.increment.valueOf(), 0, 'Increment did not roll over');
    });
  });

  describe('async', function () {
    let catflake = new Catflake({
      async: true
    });

    it('should generate unique snowflakes (300)', async function () {
      let generated = [];
      for (let i = 0; i < 300; i++) {
        let flake = await catflake.generate();
        assert(!generated.includes(flake), `A duplicate snowflake was generated: ${flake}\n\n${generated.join('\n')}`);
        generated.push(flake);
      }
    });

    it('should properly roll over (300)', async function () {
      let catflake = new Catflake({
        incrementBits: 2,
        workerBits: 10,
        processBits: 10,
        async: true
      });

      let generated = []
      for (let i = 0; i < 300; i++) {
        let flake = await catflake.generate();
        assert(!generated.includes(flake), `A duplicate snowflake was generated: ${flake}\n\n${generated.join('\n')}`);
        generated.push(flake);
      }

      generated = generated.map(sf => catflake.deconstruct(sf));
      let lastIncrement = 3;
      let lastTimestamp = 0;

      for (const deconstructed of generated) {
        if (lastTimestamp !== deconstructed.timestamp.valueOf()) {
          assert.equal(deconstructed.increment.valueOf(), 0, 'Increment did not reset');
        } else {
          assert.notEqual(lastIncrement, 3, 'Increment did not reset');
          assert.equal(deconstructed.increment.valueOf(), lastIncrement + 1,
            `Increment did not increase properly ${lastIncrement}-${deconstructed.increment.valueOf()}`);
        }
        lastIncrement = deconstructed.increment.valueOf();
        lastTimestamp = deconstructed.timestamp.valueOf();
      }
    });
  })
});