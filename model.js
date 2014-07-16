// All Tomorrow's Events -- data model
// Loaded on both the client and the server

///////////////////////////////////////////////////////////////////////////////
// Events

/*
  Each event is represented by a document in the Events collection:
    owner: user id
    lat, lng: Number (screen coordinates in the interval [0, 1])
    title, description: String
    public: Boolean
    invited: Array of user id's that are invited (only if !public)
    rsvps: Array of objects like {user: userId, rsvp: "yes"} (or "no"/"maybe")
*/
Events = new Meteor.Collection("events");

Events.allow({
  insert: function (userId, event) {
    return false; // no cowboy inserts -- use createParty method
  },
  update: function (userId, event, fields, modifier) {
    if (userId !== event.owner)
      return false; // not the owner

    var allowed = ["title", "description", "lat", "lng"];
    if (_.difference(fields, allowed).length)
      return false; // tried to write to forbidden field

    // A good improvement would be to validate the type of the new
    // value of the field (and if a string, the length.) In the
    // future Meteor will have a schema system to makes that easier.
    return true;
  },
  remove: function (userId, event) {
    // You can only remove events that you created and nobody is going to.
    return event.owner === userId && attending(event) === 0;
  }
});

attending = function (event) {
  return (_.groupBy(event.rsvps, 'rsvp').yes || []).length;
};

var NonEmptyString = Match.Where(function (lat) {
  check(lat, String);
  return lat.length !== 0;
});

createParty = function (options) {
  var id = Random.id();
  Meteor.call('createParty', _.extend({ _id: id }, options));
  return id;
};

Meteor.methods({
  // options should include: title, description, lat, lng, public
  createParty: function (options) {
    check(options, {
      title: NonEmptyString,
      description: NonEmptyString,
      lat: Number,
      lng: Number,
      public: Match.Optional(Boolean),
      _id: Match.Optional(NonEmptyString)
    });

    if (options.title.length > 100)
      throw new Meteor.Error(413, "Title too long");
    if (options.description.length > 1000)
      throw new Meteor.Error(413, "Description too long");
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in");

    var id = options._id || Random.id();
    Events.insert({
      _id: id,
      owner: this.userId,
      lat: options.lat,
      lng: options.lng,
      title: options.title,
      description: options.description,
      public: !! options.public,
      invited: [],
      rsvps: []
    });
    return id;
  },

  invite: function (partyId, userId) {
    check(partyId, String);
    check(userId, String);
    var event = Events.findOne(partyId);
    if (! event || event.owner !== this.userId)
      throw new Meteor.Error(404, "No such event");
    if (event.public)
      throw new Meteor.Error(400,
                             "That event is public. No need to invite people.");
    if (userId !== event.owner && ! _.contains(event.invited, userId)) {
      Events.update(partyId, { $addToSet: { invited: userId } });

      var from = contactEmail(Meteor.users.findOne(this.userId));
      var to = contactEmail(Meteor.users.findOne(userId));
      if (Meteor.isServer && to) {
        // This code only runs on the server. If you didn't want clients
        // to be able to see it, you could move it to a separate file.
        Email.send({
          from: "noreply@example.com",
          to: to,
          replyTo: from || undefined,
          subject: "PARTY: " + event.title,
          text:
"Hey, I just invited you to '" + event.title + "' on All Tomorrow's Events." +
"\n\nCome check it out: " + Meteor.absoluteUrl() + "\n"
        });
      }
    }
  },

  rsvp: function (partyId, rsvp) {
    check(partyId, String);
    check(rsvp, String);
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to RSVP");
    if (! _.contains(['yes', 'no', 'maybe'], rsvp))
      throw new Meteor.Error(400, "Invalid RSVP");
    var event = Events.findOne(partyId);
    if (! event)
      throw new Meteor.Error(404, "No such event");
    if (! event.public && event.owner !== this.userId &&
        !_.contains(event.invited, this.userId))
      // private, but let's not tell this to the user
      throw new Meteor.Error(403, "No such event");

    var rsvpIndex = _.indexOf(_.pluck(event.rsvps, 'user'), this.userId);
    if (rsvpIndex !== -1) {
      // update existing rsvp entry

      if (Meteor.isServer) {
        // update the appropriate rsvp entry with $
        Events.update(
          {_id: partyId, "rsvps.user": this.userId},
          {$set: {"rsvps.$.rsvp": rsvp}});
      } else {
        // minimongo doesn't yet support $ in modifier. as a temporary
        // workaround, make a modifier that uses an index. this is
        // safe on the client since there's only one thread.
        var modifier = {$set: {}};
        modifier.$set["rsvps." + rsvpIndex + ".rsvp"] = rsvp;
        Events.update(partyId, modifier);
      }

      // Possible improvement: send email to the other people that are
      // coming to the event.
    } else {
      // add new rsvp entry
      Events.update(partyId,
                     {$push: {rsvps: {user: this.userId, rsvp: rsvp}}});
    }
  }
});

///////////////////////////////////////////////////////////////////////////////
// Users

displayName = function (user) {
  if (user.profile && user.profile.name)
    return user.profile.name;
  return user.emails[0].address;
};

var contactEmail = function (user) {
  if (user.emails && user.emails.length)
    return user.emails[0].address;
  if (user.services && user.services.facebook && user.services.facebook.email)
    return user.services.facebook.email;
  return null;
};
