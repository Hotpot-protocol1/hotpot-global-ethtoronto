package tickets

import (
	"github.com/Hotpot-protocol1/hotpot-global/db"
	eventservice "github.com/Hotpot-protocol1/hotpot-global/services/contract"
	"github.com/sirupsen/logrus"
)

type Handler struct {
	log           *logrus.Entry
	userTicketsDB db.UserTickets
	infura        *eventservice.Infura
}

func New(dbHandler db.DBHandler, log *logrus.Entry, infura *eventservice.Infura) Handler {
	return Handler{
		log:           log,
		infura:        infura,
		userTicketsDB: dbHandler.UserTickets(),
	}
}
