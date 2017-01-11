describe('stress tests', function() {

  this.timeout(20000);

  var expect = require('expect.js');

  var service = require('../index');

  var serviceInstance = new service();

  var testId = require('shortid').generate();

  before('should initialize the service', function(callback) {
    //callback();
  });

  after(function(done) {

  });

  xit('checks throughput per second, sets', function(callback) {

  });

  xit('checks throughput per second, gets', function(callback) {

  });

});