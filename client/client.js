// All Tomorrow's Parties -- client

Meteor.subscribe("directory");
Meteor.subscribe("parties");

// If no party selected, or if the selected party was deleted, select one.
Meteor.startup(function () {
  Deps.autorun(function () {
    var selected = Session.get("selected");
    if (! selected || ! Parties.findOne(selected)) {
      var party = Parties.findOne();
      if (party)
        Session.set("selected", party._id);
      else
        Session.set("selected", null);
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// Party details sidebar

Template.details.party = function () {
  return Parties.findOne(Session.get("selected"));
};

Template.details.anyParties = function () {
  return Parties.find().count() > 0;
};

Template.details.creatorName = function () {
  var owner = Meteor.users.findOne(this.owner);
  if (owner._id === Meteor.userId())
    return "me";
  return displayName(owner);
};

Template.details.canRemove = function () {
  return this.owner === Meteor.userId() && attending(this) === 0;
};

Template.details.maybeChosen = function (what) {
  var myRsvp = _.find(this.rsvps, function (r) {
    return r.user === Meteor.userId();
  }) || {};

  return what == myRsvp.rsvp ? "chosen btn-inverse" : "";
};

Template.details.events({
  'click .rsvp_yes': function () {
    Meteor.call("rsvp", Session.get("selected"), "yes");
    return false;
  },
  'click .rsvp_maybe': function () {
    Meteor.call("rsvp", Session.get("selected"), "maybe");
    return false;
  },
  'click .rsvp_no': function () {
    Meteor.call("rsvp", Session.get("selected"), "no");
    return false;
  },
  'click .invite': function () {
    openInviteDialog();
    return false;
  },
  'click .remove': function () {
    Parties.remove(this._id);
    return false;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Party attendance widget

Template.attendance.rsvpName = function () {
  var user = Meteor.users.findOne(this.user);
  return displayName(user);
};

Template.attendance.outstandingInvitations = function () {
  var party = Parties.findOne(this._id);
  return Meteor.users.find({$and: [
    {_id: {$in: party.invited}}, // they're invited
    {_id: {$nin: _.pluck(party.rsvps, 'user')}} // but haven't RSVP'd
  ]});
};

Template.attendance.invitationName = function () {
  return displayName(this);
};

Template.attendance.rsvpIs = function (what) {
  return this.rsvp === what;
};

Template.attendance.nobody = function () {
  return ! this.public && (this.rsvps.length + this.invited.length === 0);
};

Template.attendance.canInvite = function () {
  return ! this.public && this.owner === Meteor.userId();
};


// Use jquery to get the position clicked relative to the map element.
var coordsRelativeToElement = function (element, event) {
  var offset = $(element).offset();
  var lat = event.pageX - offset.left;
  var lng = event.pageY - offset.top;
  return { lat: lat, lng: lng };
};

var nice = function() {
	console.log("test");
};

Template.map.events({
  'mousedown circle, mousedown text': function (event, template) {
    Session.set("selected", event.currentTarget.id);
  },
  'dblclick .map': function (event, template) {
  	console.log("here"); 
    if (! Meteor.userId()) // must be logged in to create events
      return;
    openCreateDialog(event.latlng.lat, event.latlng.lng);
  }
});


Template.map.destroyed = function () {
  this.handle && this.handle.stop();
};

///////////////////////////////////////////////////////////////////////////////
// Create Party dialog

var openCreateDialog = function (lat, lng) {
  Session.set("createCoords", {lat: lat, lng: lng});
  Session.set("createError", null);
  Session.set("showCreateDialog", true);
};

Template.page.showCreateDialog = function () {
  return Session.get("showCreateDialog");
};

Template.createDialog.events({
  'click .save': function (event, template) {
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var public = ! template.find(".private").checked;
    var coords = Session.get("createCoords");

    if (title.length && description.length) {
      var id = createParty({
        title: title,
        description: description,
        lat: coords.lat,
        lng: coords.lng,
        public: public
      });

      Session.set("selected", id);
      if (! public && Meteor.users.find().count() > 1)
        openInviteDialog();
      Session.set("showCreateDialog", false);
    } else {
      Session.set("createError",
                  "It needs a title and a description, or why bother?");
    }
  },

  'click .cancel': function () {
    Session.set("showCreateDialog", false);
  }
});

Template.createDialog.error = function () {
  return Session.get("createError");
};

///////////////////////////////////////////////////////////////////////////////
// Invite dialog

var openInviteDialog = function () {
  Session.set("showInviteDialog", true);
};

Template.page.showInviteDialog = function () {
  return Session.get("showInviteDialog");
};

Template.inviteDialog.events({
  'click .invite': function (event, template) {
    Meteor.call('invite', Session.get("selected"), this._id);
  },
  'click .done': function (event, template) {
    Session.set("showInviteDialog", false);
    return false;
  }
});

Template.inviteDialog.uninvited = function () {
  var party = Parties.findOne(Session.get("selected"));
  if (! party)
    return []; // party hasn't loaded yet
  return Meteor.users.find({$nor: [{_id: {$in: party.invited}},
                                   {_id: party.owner}]});
};

Template.inviteDialog.displayName = function () {
  return displayName(this);
};
