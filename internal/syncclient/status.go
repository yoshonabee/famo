package syncclient

import (
	"errors"
	"syscall"
)

type Status string

const (
	StatusDisabled Status = "disabled"
	StatusPending  Status = "pending"
	StatusSyncing  Status = "syncing"
	StatusOffline  Status = "offline"
	StatusSynced   Status = "synced"
	StatusError    Status = "error"
	StatusConflict Status = "conflict"
)

func cycleStatus(more bool, err error) Status {
	switch {
	case errors.Is(err, syscall.ENETDOWN), errors.Is(err, syscall.ENETUNREACH), errors.Is(err, syscall.EHOSTUNREACH):
		return StatusOffline
	case err != nil:
		return StatusError
	case more:
		return StatusPending
	default:
		return StatusSynced
	}
}
